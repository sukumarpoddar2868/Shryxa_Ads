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

print(
    "META_OAUTH_DIAGNOSTIC "
    f"app_file={__file__} "
    f"db_file={getattr(db_mod, '__file__', 'unknown')} "
    "has_consume_state="
    f"{callable(getattr(db_mod, 'consume_meta_oauth_state', None))}",
    flush=True,
)


# ---------------------------------------------------------------------
# Restore the existing authenticated session
# ---------------------------------------------------------------------

me = auth_mod.current_user()

print(
    f"META_OAUTH_DIAGNOSTIC initial_session_restored={me is not None}",
    flush=True,
)

if me is None and not st.session_state.get("_cookie_warmup_done"):
    st.session_state["_cookie_warmup_done"] = True
    me = auth_mod.current_user()

    print(
        f"META_OAUTH_DIAGNOSTIC session_after_warmup={me is not None}",
        flush=True,
    )


# ---------------------------------------------------------------------
# Meta OAuth callback
# ---------------------------------------------------------------------

def handle_meta_oauth_callback() -> None:
    """Validate the OAuth callback and prepare a pending Meta connection."""

    # Stage 1: Detect callback parameters.
    params = st.query_params

    if not any(key in params for key in ("code", "state", "error")):
        return

    print(
        "META_OAUTH_CALLBACK callback_parameters_received=True",
        flush=True,
    )

    # Stage 2: Extract parameters.
    state = params.get("state", "")
    code = params.get("code", "")
    oauth_error = params.get("error")

    print(
        "META_OAUTH_CALLBACK "
        f"has_state={bool(state)} "
        f"has_code={bool(code)} "
        f"has_provider_error={bool(oauth_error)}",
        flush=True,
    )

    # Stage 3: Remove callback parameters from the visible URL.
    # Never log the parameter values.
    print(
        "META_OAUTH_CALLBACK clearing_query_params",
        flush=True,
    )

    st.query_params.clear()

    print(
        "META_OAUTH_CALLBACK query_params_cleared",
        flush=True,
    )

    # Stage 4: Handle provider errors.
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

    # Stage 5: Validate required parameters.
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

    try:
        # Stage 6: Ensure the state-consumption function exists.
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

            raise MetaOAuthError(
                "The Meta authorization service is temporarily unavailable. "
                "Please try again later."
            )

        print(
            "META_OAUTH_CALLBACK consuming_state",
            flush=True,
        )

        # Stage 7: Atomically validate and consume the state.
        # This must happen before relying on browser-session restoration.
        state_record = consume_state(state)

        if not state_record:
            print(
                "META_OAUTH_CALLBACK state_validation_failed=True",
                flush=True,
            )

            raise MetaOAuthError(
                "The authorization request expired or was already used. "
                "Please start the connection again."
            )

        print(
            "META_OAUTH_CALLBACK state_validation_succeeded=True",
            flush=True,
        )

        # User and client IDs come from the validated server-side record,
        # never from callback URL parameters.
        user_id = int(state_record["user_id"])
        client_id = int(state_record["client_id"])

        # Stage 8: Check the current login session, if available.
        current_user = auth_mod.current_user()

        if current_user is None:
            print(
                "META_OAUTH_CALLBACK session_missing_using_validated_state=True",
                flush=True,
            )
        else:
            if int(current_user["id"]) != user_id:
                print(
                    "META_OAUTH_CALLBACK state_user_mismatch=True",
                    flush=True,
                )

                raise MetaOAuthError(
                    "This authorization request belongs to a different "
                    "signed-in user. Please sign in to the correct account "
                    "and reconnect Meta."
                )

            print(
                "META_OAUTH_CALLBACK authenticated_user_present=True",
                flush=True,
            )

        # Stage 9: Confirm that the client still belongs to this user.
        print(
            "META_OAUTH_CALLBACK checking_client_ownership",
            flush=True,
        )

        owned_clients = db_mod.list_clients(user_id)

        client_exists = any(
            int(client["id"]) == client_id
            for client in owned_clients
        )

        if not client_exists:
            print(
                "META_OAUTH_CALLBACK client_ownership_check_failed=True",
                flush=True,
            )

            raise MetaOAuthError(
                "The client associated with this authorization could not "
                "be found in your workspace. Please start again."
            )

        print(
            "META_OAUTH_CALLBACK client_ownership_check_succeeded=True",
            flush=True,
        )

        # Stage 10: Exchange the authorization code.
        print(
            "META_OAUTH_CALLBACK exchanging_authorization_code",
            flush=True,
        )

        token_data = exchange_code_for_token(code)
        access_token = token_data.get("access_token")

        if not isinstance(access_token, str) or not access_token:
            print(
                "META_OAUTH_CALLBACK access_token_missing=True",
                flush=True,
            )

            raise MetaOAuthError(
                "Meta did not return a usable access token. "
                "Please connect again."
            )

        print(
            "META_OAUTH_CALLBACK token_exchange_succeeded=True",
            flush=True,
        )

        # Stage 11: Retrieve the Meta profile.
        print(
            "META_OAUTH_CALLBACK fetching_meta_profile",
            flush=True,
        )

        profile = get_meta_profile(access_token)

        print(
            "META_OAUTH_CALLBACK meta_profile_fetch_succeeded=True",
            flush=True,
        )

        # Stage 12: Retrieve accessible ad accounts.
        print(
            "META_OAUTH_CALLBACK fetching_ad_accounts",
            flush=True,
        )

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

        print(
            "META_OAUTH_CALLBACK ad_account_fetch_succeeded=True "
            f"account_count={len(accounts)}",
            flush=True,
        )

        # Stage 13: Parse token expiry.
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

        # Stage 14: Save pending data in Streamlit session state.
        #
        # NOTE: Session state is not durable across genuinely new sessions.
        # This diagnostic update does not solve cross-session persistence.
        # Never put access tokens in URLs or logs.
        st.session_state["_meta_oauth_pending"] = {
            "user_id": user_id,
            "client_id": client_id,
            "access_token": access_token,
            "meta_user_id": str(profile["id"]),
            "meta_user_name": profile.get("name"),
            "token_expires_at": token_expires_at,
            "accounts": accounts,
        }

        st.session_state.pop("_meta_oauth_error", None)

        print(
            "META_OAUTH_CALLBACK pending_connection_saved_to_session=True",
            flush=True,
        )

        print(
            "META_OAUTH_CALLBACK token_exchange_and_account_fetch_succeeded=True",
            flush=True,
        )

        if current_user is None:
            print(
                "META_OAUTH_CALLBACK login_required_to_finish=True",
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
        print(
            "META_OAUTH_CALLBACK data_processing_error="
            f"{type(exc).__name__}",
            flush=True,
        )

        st.session_state["_meta_oauth_error"] = (
            "Could not complete the Meta connection. Please try again."
        )

    except Exception as exc:
        # Do not log exception text: provider exceptions can sometimes
        # contain request details. Log only the exception class.
        print(
            "META_OAUTH_CALLBACK unexpected_error="
            f"{type(exc).__name__}",
            flush=True,
        )

        st.session_state["_meta_oauth_error"] = (
            "Could not complete the Meta connection. Please try again."
        )


# Process the callback before rendering navigation.
handle_meta_oauth_callback()


# ---------------------------------------------------------------------
# Application navigation
# ---------------------------------------------------------------------

THIS_DIR = Path(__file__).parent

policy_pages = [
    st.Page(str(THIS_DIR / "views" / "terms.py"), title="Terms"),
    st.Page(str(THIS_DIR / "views" / "privacy.py"), title="Privacy"),
    st.Page(str(THIS_DIR / "views" / "refund.py"), title="Refund"),
    st.Page(str(THIS_DIR / "views" / "service.py"), title="Service"),
]

# Refresh the authenticated user after callback processing.
me = auth_mod.current_user()

print(
    f"META_OAUTH_DIAGNOSTIC session_before_navigation={me is not None}",
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

    if me.get("is_admin"):
        pages.append(
            st.Page(
                str(THIS_DIR / "views" / "admin.py"),
                title="Admin",
            )
        )

nav = st.navigation(pages, position="top")
nav.run()
