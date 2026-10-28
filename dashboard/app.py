"""Meta Ads Launcher — entry point.

When not signed in: only the Sign-in page is in the nav.
When signed in: Dashboard · Create · Preview · Manage · Account · Clients
                (+ Admin tab ONLY for users flagged is_admin = 1 in DB)

Handles Meta OAuth callbacks before normal page navigation.
"""

from __future__ import annotations

import sys
from datetime import datetime, timedelta, timezone
from pathlib import Path

# ---------------------------------------------------------------------
# Project paths
# ---------------------------------------------------------------------

ROOT = Path(__file__).resolve().parent.parent

if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

PAYLOAD_PIPELINE = ROOT / "payload_pipeline"

if str(PAYLOAD_PIPELINE) not in sys.path:
    sys.path.insert(0, str(PAYLOAD_PIPELINE))

# ---------------------------------------------------------------------
# Streamlit initialization
# ---------------------------------------------------------------------

import streamlit as st

st.set_page_config(
    page_title="Meta Ads Launcher",
    layout="wide",
    initial_sidebar_state="expanded",
)

# ---------------------------------------------------------------------
# Authentication and OAuth helpers
# ---------------------------------------------------------------------

from auth import auth as auth_mod
from auth import db as db_mod
from auth.meta_oauth import (
    MetaOAuthError,
    exchange_code_for_token,
    get_ad_accounts,
    get_meta_profile,
)

# ---------------------------------------------------------------------
# Diagnostic logging
# ---------------------------------------------------------------------
# Streamlit Cloud captures stdout. Using print() here makes the
# diagnostic easy to find in the deployed app's logs.
#
# Never log authorization codes, OAuth state values, or access tokens.
# ---------------------------------------------------------------------

print(
    "META_OAUTH_DIAGNOSTIC "
    f"app_file={__file__} "
    f"db_file={getattr(db_mod, '__file__', 'unknown')} "
    f"has_consume_state={hasattr(db_mod, 'consume_meta_oauth_state')}",
    flush=True,
)

# ---------------------------------------------------------------------
# Restore the existing authenticated session
# ---------------------------------------------------------------------

me = auth_mod.current_user()

print(
    "META_OAUTH_DIAGNOSTIC "
    f"initial_session_restored={me is not None}",
    flush=True,
)

# Retain the existing cookie warm-up attempt.
# This does not guarantee that the browser cookie has finished loading.
if me is None and not st.session_state.get("_cookie_warmup_done"):
    st.session_state["_cookie_warmup_done"] = True
    me = auth_mod.current_user()

    print(
        "META_OAUTH_DIAGNOSTIC "
        f"session_after_warmup={me is not None}",
        flush=True,
    )


# ---------------------------------------------------------------------
# Meta OAuth callback
# ---------------------------------------------------------------------

def handle_meta_oauth_callback() -> None:
    """Validate a Meta callback and keep pending connection data server-side."""

    params = st.query_params

    # This is not a Meta OAuth callback; continue normal navigation.
    if not any(key in params for key in ("code", "state", "error")):
        return

    print(
        "META_OAUTH_CALLBACK callback_parameters_received=True",
        flush=True,
    )

    state = params.get("state", "")
    code = params.get("code", "")
    oauth_error = params.get("error")

    # Remove the one-time callback parameters from the browser URL.
    # Do not log their values.
    st.query_params.clear()

    if oauth_error:
        print(
            "META_OAUTH_CALLBACK provider_returned_error=True",
            flush=True,
        )

        st.session_state["_meta_oauth_error"] = (
            "Meta authorization was cancelled or denied. "
            "You can try connecting again."
        )
        return

    if not state or not code:
        print(
            "META_OAUTH_CALLBACK incomplete_response=True",
            flush=True,
        )

        st.session_state["_meta_oauth_error"] = (
            "Meta returned an incomplete authorization response. "
            "Please try connecting again."
        )
        return

    # Check the authenticated user.
    current_user = auth_mod.current_user()

    if not current_user:
        print(
            "META_OAUTH_CALLBACK authenticated_user_missing=True",
            flush=True,
        )

        st.session_state["_meta_oauth_error"] = (
            "Your session could not be verified. Please sign in and "
            "start the Meta connection again."
        )
        return

    print(
        "META_OAUTH_CALLBACK authenticated_user_present=True",
        flush=True,
    )

    try:
        # Verify that the expected database function is available.
        consume_state = getattr(
            db_mod,
            "consume_meta_oauth_state",
            None,
        )

        if not callable(consume_state):
            print(
                "META_OAUTH_CALLBACK consume_state_function_missing=True",
                flush=True,
            )

            st.session_state["_meta_oauth_error"] = (
                "The Meta authorization service is temporarily unavailable. "
                "Please try again later."
            )
            return

        # Atomically validate and consume the one-time state.
        state_record = consume_state(state)

        if not state_record:
            print(
                "META_OAUTH_CALLBACK state_validation_failed=True",
                flush=True,
            )

            raise MetaOAuthError(
                "The authorization request expired or was already used. "
                "Please try connecting again."
            )

        # Never trust a user ID or client ID from the callback URL.
        if int(state_record["user_id"]) != int(current_user["id"]):
            print(
                "META_OAUTH_CALLBACK state_user_mismatch=True",
                flush=True,
            )

            raise MetaOAuthError(
                "The authorization request does not belong to this user."
            )

        client_id = int(state_record["client_id"])
        user_id = int(current_user["id"])

        # Exchange the authorization code on the server.
        token_data = exchange_code_for_token(code)
        access_token = token_data["access_token"]

        # Retrieve the identity associated with this token and its accounts.
        profile = get_meta_profile(access_token)
        accounts = get_ad_accounts(access_token)

        if not accounts:
            print(
                "META_OAUTH_CALLBACK no_accessible_ad_accounts=True",
                flush=True,
            )

            raise MetaOAuthError(
                "No accessible Meta ad accounts were found. Check that "
                "the authorized Meta user has access to an ad account."
            )

        # Parse the token expiry when Meta provides one.
        token_expires_at = None
        expires_in = token_data.get("expires_in")

        if expires_in is not None:
            try:
                token_expires_at = (
                    datetime.now(timezone.utc)
                    + timedelta(seconds=int(expires_in))
                )
            except (ValueError, TypeError, OverflowError):
                token_expires_at = None

        # Tokens remain server-side in Streamlit session state.
        # Never put access tokens in query parameters or display them.
        st.session_state["_meta_oauth_pending"] = {
            "user_id": user_id,
            "client_id": client_id,
            "access_token": access_token,
            "meta_user_id": str(profile["id"]),
            "meta_user_name": profile.get("name"),
            "token_expires_at": token_expires_at,
            "accounts": accounts,
        }

        # Clear any previous callback error.
        st.session_state.pop("_meta_oauth_error", None)

        print(
            "META_OAUTH_CALLBACK token_exchange_and_account_fetch_succeeded=True",
            flush=True,
        )

    except MetaOAuthError as exc:
        print(
            "META_OAUTH_CALLBACK handled_error="
            f"{type(exc).__name__}",
            flush=True,
        )

        st.session_state["_meta_oauth_error"] = str(exc)

    except (ValueError, KeyError, TypeError) as exc:
        # Avoid exposing internal details or sensitive values to the user.
        print(
            "META_OAUTH_CALLBACK data_processing_error="
            f"{type(exc).__name__}",
            flush=True,
        )

        st.session_state["_meta_oauth_error"] = (
            "Could not complete the Meta connection. Please try again."
        )


# Process a Meta callback before rendering navigation.
handle_meta_oauth_callback()


# ---------------------------------------------------------------------
# Application navigation
# ---------------------------------------------------------------------

THIS_DIR = Path(__file__).parent

# Public policy pages remain visible regardless of authentication state.
policy_pages = [
    st.Page(str(THIS_DIR / "views" / "terms.py"), title="Terms"),
    st.Page(str(THIS_DIR / "views" / "privacy.py"), title="Privacy"),
    st.Page(str(THIS_DIR / "views" / "refund.py"), title="Refund"),
    st.Page(str(THIS_DIR / "views" / "service.py"), title="Service"),
]

# Refresh the authenticated user after callback processing.
me = auth_mod.current_user()

print(
    "META_OAUTH_DIAGNOSTIC "
    f"session_before_navigation={me is not None}",
    flush=True,
)

if me is None:
    pages = [
        st.Page(
            str(THIS_DIR / "views" / "login.py"),
            title="Sign in",
            default=True,
        ),
        *policy_pages,
    ]

else:
    pages = [
        st.Page(
            str(THIS_DIR / "views" / "dashboard.py"),
            title="Dashboard",
            default=True,
        ),
        st.Page(str(THIS_DIR / "views" / "create.py"), title="Create"),
        st.Page(str(THIS_DIR / "views" / "preview.py"), title="Preview"),
        st.Page(str(THIS_DIR / "views" / "manage.py"), title="Manage"),
        st.Page(str(THIS_DIR / "views" / "account.py"), title="Account"),
        st.Page(str(THIS_DIR / "views" / "clients.py"), title="Clients"),
        *policy_pages,
    ]

    # Admin tab is visible only to users marked as administrators.
    if me.get("is_admin"):
        pages.append(
            st.Page(
                str(THIS_DIR / "views" / "admin.py"),
                title="Admin",
            )
        )

nav = st.navigation(pages, position="top")
nav.run()
