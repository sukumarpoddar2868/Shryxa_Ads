"""Meta Ads Launcher — entry point.

When not signed in: only the Sign-in page is in the nav.

When signed in: Dashboard · Create · Preview · Manage · Account · Clients
(+ Admin tab ONLY for users flagged is_admin = 1 in DB).

Handles Meta OAuth callbacks before normal page navigation.
"""

from __future__ import annotations

import sys
from datetime import datetime, timedelta, timezone
from pathlib import Path

from auth.meta_security import encrypt_access_token


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

# One extra check can help when the authentication cookie has not yet
# been restored during the first Streamlit execution.
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
    """Validate the Meta OAuth callback and persist a pending connection."""

    params = st.query_params

    # Only process an actual Meta OAuth callback.
    if not any(key in params for key in ("code", "state", "error")):
        return

    state = params.get("state", "")
    code = params.get("code", "")
    oauth_error = params.get("error")

    print(
        "META_OAUTH_CALLBACK callback_received=True "
        f"has_state={bool(state)} "
        f"has_code={bool(code)} "
        f"has_provider_error={bool(oauth_error)}",
        flush=True,
    )

    try:
        # Handle authorization denied or cancelled by the user.
        if oauth_error:
            st.session_state["_meta_oauth_error"] = (
                "Meta authorization was cancelled or denied. "
                "Please try connecting again."
            )
            st.query_params.clear()
            return

        # Meta must return both the authorization code and state.
        if not state or not code:
            st.session_state["_meta_oauth_error"] = (
                "Meta returned an incomplete authorization response. "
                "Please try connecting again."
            )
            st.query_params.clear()
            return

        # Validate and consume the server-side OAuth state.
        # This also prevents reuse of the same authorization request.
        state_record = db_mod.consume_meta_oauth_state(state)

        if not state_record:
            st.session_state["_meta_oauth_error"] = (
                "The authorization request expired or was already used. "
                "Please start the connection again."
            )
            st.query_params.clear()
            return

        user_id = int(state_record["user_id"])
        client_id = int(state_record["client_id"])

        # If another user is signed in, reject this callback.
        current_user = auth_mod.current_user()

        if (
            current_user is not None
            and int(current_user["id"]) != user_id
        ):
            raise MetaOAuthError(
                "This authorization request belongs to a different "
                "signed-in user. Sign in to the correct account and reconnect."
            )

        # Recheck client ownership using the IDs from the validated state.
        owned_clients = db_mod.list_clients(user_id)

        if not any(
            int(client["id"]) == client_id
            for client in owned_clients
        ):
            raise MetaOAuthError(
                "The client associated with this authorization was not found. "
                "Please start the connection again."
            )

        # Exchange the one-time authorization code for an access token.
        token_data = exchange_code_for_token(code)
        access_token = token_data.get("access_token")

        if not isinstance(access_token, str) or not access_token:
            raise MetaOAuthError(
                "Meta did not return a usable access token. "
                "Please connect again."
            )

        # Fetch the authorized Meta profile and available ad accounts.
        profile = get_meta_profile(access_token)
        accounts = get_ad_accounts(access_token)

        if not accounts:
            raise MetaOAuthError(
                "No accessible Meta ad accounts were found. "
                "Check that this Meta user has access to an ad account."
            )

        # Parse token expiry when Meta supplies an expires_in value.
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

        # Encrypt the token before storing it.
        encrypted_token = encrypt_access_token(access_token)

        # Persist the pending connection in the database.
        #
        # The returned ticket is an opaque, random, short-lived value.
        # It is not the Meta access token.
        #
        # This allows the app to recover the pending connection even if
        # Streamlit creates a new session after the OAuth redirect.
        ticket = db_mod.create_meta_oauth_pending(
            user_id=user_id,
            client_id=client_id,
            encrypted_access_token=encrypted_token,
            meta_user_id=str(profile.get("id") or "") or None,
            meta_user_name=str(profile.get("name") or "") or None,
            accounts=accounts,
            token_expires_at=token_expires_at,
        )

        st.session_state.pop("_meta_oauth_error", None)

        print(
            "META_OAUTH_CALLBACK pending_connection_saved_to_database=True "
            f"account_count={len(accounts)}",
            flush=True,
        )

        # Remove the authorization code and OAuth state from the URL.
        # Retain only the one-time pending ticket so a new Streamlit
        # session can recover the connection.
        st.query_params.clear()
        st.query_params["meta_pending"] = ticket

    except MetaOAuthError as exc:
        print(
            "META_OAUTH_CALLBACK handled_error="
            f"{type(exc).__name__}",
            flush=True,
        )

        st.session_state["_meta_oauth_error"] = str(exc)
        st.query_params.clear()

    except (ValueError, KeyError, TypeError) as exc:
        print(
            "META_OAUTH_CALLBACK data_processing_error="
            f"{type(exc).__name__}",
            flush=True,
        )

        st.session_state["_meta_oauth_error"] = (
            "Could not complete the Meta connection. "
            "Please start the connection again."
        )
        st.query_params.clear()

    except Exception as exc:
        # Never log exception text, tokens, authorization codes,
        # or sensitive URL parameters.
        import traceback
        traceback.print_exc()
        print(
            "META_OAUTH_CALLBACK unexpected_error="
            f"{type(exc).__name__}",
            flush=True,
        )

        st.session_state["_meta_oauth_error"] = (
            "Could not complete the Meta connection. "
            "Please check the server logs and try again."
        )
        st.query_params.clear()


# Process the OAuth callback before rendering navigation.
handle_meta_oauth_callback()


# ---------------------------------------------------------------------
# Application navigation
# ---------------------------------------------------------------------

THIS_DIR = Path(__file__).parent

policy_pages = [
    st.Page(
        str(THIS_DIR / "views" / "terms.py"),
        title="Terms",
    ),
    st.Page(
        str(THIS_DIR / "views" / "privacy.py"),
        title="Privacy",
    ),
    st.Page(
        str(THIS_DIR / "views" / "refund.py"),
        title="Refund",
    ),
    st.Page(
        str(THIS_DIR / "views" / "service.py"),
        title="Service",
    ),
]


# Refresh the authenticated user after processing the OAuth callback.
me = auth_mod.current_user()

print(
    f"META_OAUTH_DIAGNOSTIC session_before_navigation={me is not None}",
    flush=True,
)


if me is None:
    # Signed-out users only see Sign in and policy pages.
    pages = [
        st.Page(
            str(THIS_DIR / "views" / "login.py"),
            title="Sign in",
            default=True,
        ),
        *policy_pages,
    ]

else:
    # Authenticated users see the main application pages.
    pages = [
        st.Page(
            str(THIS_DIR / "views" / "dashboard.py"),
            title="Dashboard",
            default=True,
        ),
        st.Page(
            str(THIS_DIR / "views" / "create.py"),
            title="Create",
        ),
        st.Page(
            str(THIS_DIR / "views" / "preview.py"),
            title="Preview",
        ),
        st.Page(
            str(THIS_DIR / "views" / "manage.py"),
            title="Manage",
        ),
        st.Page(
            str(THIS_DIR / "views" / "account.py"),
            title="Account",
        ),
        st.Page(
            str(THIS_DIR / "views" / "clients.py"),
            title="Clients",
        ),
        *policy_pages,
    ]

    # Admin page is available only to users marked as admins in the DB.
    if me.get("is_admin"):
        pages.append(
            st.Page(
                str(THIS_DIR / "views" / "admin.py"),
                title="Admin",
            )
        )


# Render the application navigation.
nav = st.navigation(pages, position="top")
nav.run()
