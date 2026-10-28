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

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))
sys.path.insert(0, str(ROOT / "payload_pipeline"))

import streamlit as st

st.set_page_config(
    page_title="Meta Ads Launcher",
    layout="wide",
    initial_sidebar_state="expanded",
)

# ---------------------------------------------------------------------
# Authentication and OAuth helpers
# ---------------------------------------------------------------------

from auth import auth as auth_mod  # noqa: E402
from auth import db as db_mod  # noqa: E402
from auth.meta_oauth import (  # noqa: E402
    MetaOAuthError,
    exchange_code_for_token,
    get_ad_accounts,
    get_meta_profile,
)

# ---------------------------------------------------------------------
# Restore the existing authenticated session
# ---------------------------------------------------------------------

# Cookies populate after the controller component renders, so the first
# pass may return None even when a valid session cookie exists.
me = auth_mod.current_user()

if me is None and not st.session_state.get("_cookie_warmup_done"):
    st.session_state["_cookie_warmup_done"] = True
    me = auth_mod.current_user()


# ---------------------------------------------------------------------
# Meta OAuth callback
# ---------------------------------------------------------------------

def handle_meta_oauth_callback() -> None:
    """Validate a Meta callback and keep pending connection data server-side."""

    params = st.query_params

    # This is not a Meta OAuth callback; continue normal navigation.
    if not any(key in params for key in ("code", "state", "error")):
        return

    state = params.get("state", "")
    code = params.get("code", "")
    oauth_error = params.get("error")

    # Remove the one-time callback parameters from the browser URL.
    st.query_params.clear()

    if oauth_error:
        # Do not display raw provider error parameters.
        st.session_state["_meta_oauth_error"] = (
            "Meta authorization was cancelled or denied. "
            "You can try connecting again."
        )
        return

    if not state or not code:
        st.session_state["_meta_oauth_error"] = (
            "Meta returned an incomplete authorization response. "
            "Please try connecting again."
        )
        return

    # A callback must belong to an existing authenticated session.
    current_user = auth_mod.current_user()

    if not current_user:
        st.session_state["_meta_oauth_error"] = (
            "Your session could not be verified. Please sign in and "
            "start the Meta connection again."
        )
        return

    try:
        # Atomically validate and consume the one-time state.
        state_record = db_mod.consume_meta_oauth_state(state)

        if not state_record:
            raise MetaOAuthError(
                "The authorization request expired or was already used. "
                "Please try connecting again."
            )

        # Never trust a user ID or client ID from the callback URL.
        if int(state_record["user_id"]) != int(current_user["id"]):
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

    except MetaOAuthError as exc:
        st.session_state["_meta_oauth_error"] = str(exc)

    except (ValueError, KeyError, TypeError):
        # Avoid showing unexpected internal details to the user.
        st.session_state["_meta_oauth_error"] = (
            "Could not complete the Meta connection. Please try again."
        )


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
