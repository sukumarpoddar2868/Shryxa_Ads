"""Client management and client-specific Meta account connections."""
from __future__ import annotations

import logging
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent.parent
sys.path.insert(0, str(ROOT))

import streamlit as st

from auth.gate import gate
from auth import db
from auth.meta_oauth import (
    MetaOAuthError,
    build_authorization_url,
)
from auth.meta_security import encrypt_access_token

# pyrefly: ignore[missing-import]
from styles import hero, inject_css, section_label, status_pill


logger = logging.getLogger(__name__)

SERVICE_LABELS = {
    "agency_managed": "Agency-managed",
    "self_service": "Self-service",
}

BILLING_LABELS = {
    "management_fee_only": "Management fee only",
    "management_plus_ad_budget": "Management fee + ad budget",
}

STATUS_LABELS = {
    "pending_access": "Pending access",
    "active": "Active",
    "paused": "Paused",
}


def _account_digits(account: dict) -> str:
    """Return the digits-only account ID expected by the campaign pipeline."""
    value = str(account.get("account_id") or "").strip()

    if not value:
        value = str(account.get("id") or "").strip()
        if value.startswith("act_"):
            value = value[4:]

    if not value or not value.isdigit():
        raise ValueError(
            "Meta returned an account without a valid numeric account ID."
        )

    return value


def _account_label(account: dict) -> str:
    try:
        account_id = _account_digits(account)
    except ValueError:
        account_id = str(account.get("id") or "Unknown ID")

    name = str(account.get("name") or "Unnamed ad account")
    currency = str(account.get("currency") or "")
    return f"{name} — {account_id}" + (f" ({currency})" if currency else "")


inject_css()
me = gate()

user_id = int(me["id"])
limit = max(0, int(me.get("client_limit", 0)))

hero(
    "Clients",
    kicker="Client management",
    subtitle=(
        "Manage your client records and connect each client's Meta ad account. "
        "Connecting an account does not launch or spend money on ads."
    ),
)

# Show callback errors without displaying provider parameters or tokens.
oauth_error = st.session_state.pop("_meta_oauth_error", None)
if oauth_error:
    st.error(str(oauth_error))

# ---------------------------------------------------------------------
# Finish a pending OAuth connection by selecting an account and saving it.
# ---------------------------------------------------------------------
pending = st.session_state.get("_meta_oauth_pending")

if pending:
    pending_user_id = pending.get("user_id")
    pending_client_id = pending.get("client_id")

    # Never accept pending OAuth data belonging to another workspace user.
    if str(pending_user_id) != str(user_id):
        st.session_state.pop("_meta_oauth_pending", None)
        st.error(
            "The pending Meta connection does not belong to your account. "
            "Please start the connection again."
        )
    else:
        clients_for_user = db.list_clients(user_id)
        owned_client_ids = {
            int(client["id"]) for client in clients_for_user
        }

        if (
            not isinstance(pending_client_id, int)
            or pending_client_id not in owned_client_ids
        ):
            st.session_state.pop("_meta_oauth_pending", None)
            st.error(
                "The client associated with this authorization was not found "
                "in your workspace. Please start the connection again."
            )
        else:
            pending_client = next(
                client
                for client in clients_for_user
                if int(client["id"]) == pending_client_id
            )

            with st.container(border=True):
                section_label("Finish connecting Meta")

                st.write(
                    f"Authorized Meta user: "
                    f"**{pending.get('meta_user_name') or 'Meta user'}**"
                )
                st.caption(
                    f"Client: {pending_client.get('business_name') or 'Unnamed'}"
                )

                accounts = pending.get("accounts") or []

                if not accounts:
                    st.error("Meta did not return any available ad accounts.")
                else:
                    account_options = list(range(len(accounts)))

                    selected_index = st.selectbox(
                        "Choose the ad account for this client",
                        options=account_options,
                        format_func=lambda index: _account_label(
                            accounts[index]
                        ),
                        key=f"meta_account_select_{pending_client_id}",
                    )

                    if st.button(
                        "Save Meta connection",
                        type="primary",
                        key=f"save_meta_connection_{pending_client_id}",
                        use_container_width=True,
                    ):
                        try:
                            selected_account = accounts[selected_index]
                            account_id = _account_digits(selected_account)
                            account_name = str(
                                selected_account.get("name") or ""
                            ).strip() or None

                            access_token = pending.get("access_token")
                            if not isinstance(access_token, str) or not access_token:
                                raise ValueError(
                                    "The pending authorization token is missing. "
                                    "Please connect Meta again."
                                )

                            encrypted_token = encrypt_access_token(access_token)

                            db.save_meta_connection(
                                user_id=user_id,
                                client_id=pending_client_id,
                                ad_account_id=account_id,
                                encrypted_access_token=encrypted_token,
                                meta_user_id=str(
                                    pending.get("meta_user_id") or ""
                                ) or None,
                                meta_user_name=str(
                                    pending.get("meta_user_name") or ""
                                ) or None,
                                ad_account_name=account_name,
                                token_expires_at=pending.get(
                                    "token_expires_at"
                                ),
                            )

                        except (ValueError, MetaOAuthError) as exc:
                            st.error(str(exc))
                        except Exception:
                            logger.exception(
                                "Failed to save Meta connection for client %s",
                                pending_client_id,
                            )
                            st.error(
                                "Could not save the Meta connection. "
                                "Check the server logs for details."
                            )
                        else:
                            # Remove the plaintext token from session state
                            # once the encrypted value has been persisted.
                            st.session_state.pop("_meta_oauth_pending", None)

                            # A saved link must not be reused for a future
                            # authorization attempt.
                            links = st.session_state.get(
                                "_meta_oauth_authorization_links", {}
                            )
                            links.pop(pending_client_id, None)
                            st.session_state[
                                "_meta_oauth_authorization_links"
                            ] = links

                            st.success(
                                "Meta ad account connected successfully."
                            )
                            st.rerun()

st.divider()

# ---------------------------------------------------------------------
# Client summary
# ---------------------------------------------------------------------
clients = db.list_clients(user_id)
count = len(clients)

c1, c2, c3 = st.columns(3)
c1.metric("Registered clients", count)
c2.metric("Client limit", limit)
c3.metric("Available slots", max(0, limit - count))

st.divider()

# ---------------------------------------------------------------------
# Add client
# ---------------------------------------------------------------------
with st.container(border=True):
    section_label("Add a client")

    st.caption(
        "Register a business first, then connect its Meta account. "
        "Adding a client does not launch ads."
    )

    if count >= limit:
        st.warning(
            "You've reached your current client limit. Upgrade your plan "
            "or remove a client before adding another."
        )
    else:
        with st.form("add_client_form", clear_on_submit=True):
            business_name = st.text_input(
                "Business name *",
                placeholder="e.g. Sunrise Salon",
                max_chars=150,
            )

            service_model = st.selectbox(
                "Service model",
                options=["agency_managed", "self_service"],
                format_func=lambda value: SERVICE_LABELS[value],
                help=(
                    "Agency-managed: you run campaigns for the client. "
                    "Self-service: the customer uses Shryxa Ads themselves."
                ),
            )

            ad_account_id = st.text_input(
                "Meta Ad Account ID *",
                placeholder="e.g. 123456789012345",
                help=(
                    "Enter the digits-only account ID. You can update this "
                    "record by connecting a Meta account below."
                ),
                max_chars=100,
            )

            page_id = st.text_input(
                "Facebook Page ID (optional)",
                placeholder="e.g. 123456789012345",
                max_chars=100,
            )

            billing_arrangement = None

            if service_model == "agency_managed":
                billing_arrangement = st.selectbox(
                    "Billing arrangement",
                    options=[
                        "management_fee_only",
                        "management_plus_ad_budget",
                    ],
                    format_func=lambda value: BILLING_LABELS[value],
                    help=(
                        "Records your agreement with the client. "
                        "It does not collect payments or pay Meta."
                    ),
                )

            submitted = st.form_submit_button(
                "Add client",
                type="primary",
                use_container_width=True,
            )

        if submitted:
            business_name = business_name.strip()
            ad_account_id = ad_account_id.strip()
            page_id = page_id.strip()

            if not business_name:
                st.error("Enter the business name.")
            elif not ad_account_id:
                st.error("Enter the Meta Ad Account ID.")
            elif any(ch.isspace() for ch in ad_account_id):
                st.error("The Ad Account ID must not contain spaces.")
            elif not re.fullmatch(r"\d+", ad_account_id):
                st.error(
                    "Enter the numeric Ad Account ID only, without 'act_'."
                )
            elif page_id and any(ch.isspace() for ch in page_id):
                st.error("The Facebook Page ID must not contain spaces.")
            else:
                try:
                    db.add_client(
                        user_id=user_id,
                        business_name=business_name,
                        ad_account_id=ad_account_id,
                        page_id=page_id,
                        service_model=service_model,
                        billing_arrangement=billing_arrangement,
                        client_status="pending_access",
                    )
                except ValueError as exc:
                    st.error(str(exc))
                except Exception:
                    logger.exception("Failed to save client")
                    st.error(
                        "Could not save the client. "
                        "Check the server logs for details."
                    )
                else:
                    st.success(f"{business_name} was added.")
                    st.rerun()

# ---------------------------------------------------------------------
# Client list and per-client Meta connection actions
# ---------------------------------------------------------------------
st.divider()
section_label("Your clients")

clients = db.list_clients(user_id)

if not clients:
    st.info(
        "No clients yet. Use the form above to register your first business."
    )
else:
    st.caption(f"{len(clients)} client(s) registered in this workspace.")

    authorization_links = st.session_state.get(
        "_meta_oauth_authorization_links", {}
    )

    for client in clients:
        client_id = int(client["id"])
        business_name = client.get("business_name") or "Unnamed business"
        service_model = client.get("service_model") or "self_service"
        billing = client.get("billing_arrangement")
        client_status = client.get("client_status") or "pending_access"

        try:
            connection = db.get_meta_connection(user_id, client_id)
        except Exception:
            logger.exception(
                "Could not load Meta connection for client %s", client_id
            )
            connection = None
            connection_lookup_failed = True
        else:
            connection_lookup_failed = False

        with st.container(border=True):
            heading, status_col = st.columns([3, 1])

            with heading:
                st.subheader(business_name)
                st.caption(f"Client ID: {client_id}")

            with status_col:
                st.markdown(
                    status_pill(client_status),
                    unsafe_allow_html=True,
                )

            details1, details2 = st.columns(2)

            with details1:
                st.markdown("**Service model**")
                st.write(SERVICE_LABELS.get(service_model, service_model))

                st.markdown("**Registered Ad Account ID**")
                st.code(
                    client.get("ad_account_id") or "—",
                    language=None,
                )

            with details2:
                st.markdown("**Billing arrangement**")
                st.write(
                    BILLING_LABELS.get(billing, billing)
                    if billing
                    else "Not applicable"
                )

                st.markdown("**Facebook Page ID**")
                st.write(client.get("page_id") or "Not provided")

            if connection_lookup_failed:
                st.warning("Could not load this client's Meta connection.")
            elif connection:
                st.markdown("**Meta connection**")
                status = connection.get("connection_status") or "unknown"

                if status == "connected":
                    st.success(
                        "Connected: "
                        f"{connection.get('ad_account_name') or 'Meta ad account'}"
                    )
                else:
                    st.warning(f"Connection status: {status}")

                st.caption(
                    "Connected account ID: "
                    f"{connection.get('ad_account_id') or '—'}"
                )
                st.caption(
                    "Authorized Meta user: "
                    f"{connection.get('meta_user_name') or '—'}"
                )

                connected_at = connection.get("connected_at")
                if connected_at:
                    st.caption(f"Connected at: {str(connected_at)[:19]}")

                with st.expander("Disconnect Meta account"):
                    st.warning(
                        "This removes the saved connection from Shryxa Ads. "
                        "It does not delete the Meta ad account or revoke "
                        "authorization from Meta itself."
                    )

                    confirm_disconnect = st.checkbox(
                        "I confirm I want to remove this saved connection.",
                        key=f"confirm_disconnect_meta_{client_id}",
                    )

                    if st.button(
                        "Disconnect Meta",
                        key=f"disconnect_meta_{client_id}",
                        disabled=not confirm_disconnect,
                    ):
                        try:
                            db.remove_meta_connection(user_id, client_id)
                        except Exception:
                            logger.exception(
                                "Failed to disconnect Meta for client %s",
                                client_id,
                            )
                            st.error(
                                "Could not remove the Meta connection. "
                                "Check the server logs for details."
                            )
                        else:
                            links = st.session_state.get(
                                "_meta_oauth_authorization_links", {}
                            )
                            links.pop(client_id, None)
                            st.session_state[
                                "_meta_oauth_authorization_links"
                            ] = links
                            st.success("Saved Meta connection removed.")
                            st.rerun()
            else:
                st.info("No Meta account connected yet.")

            # Create a fresh authorization state only when the user requests
            # a connection. The generated link is then shown as a separate
            # click, avoiding an unsafe automatic redirect.
            with st.container():
                if st.button(
                    "Connect Meta Account"
                    if not connection
                    else "Reconnect Meta Account",
                    key=f"start_meta_oauth_{client_id}",
                    type="primary",
                ):
                    try:
                        state = db.create_meta_oauth_state(user_id, client_id)
                        url = build_authorization_url(state)

                        authorization_links[client_id] = url
                        st.session_state[
                            "_meta_oauth_authorization_links"
                        ] = authorization_links
                    except (ValueError, MetaOAuthError) as exc:
                        st.error(str(exc))
                    except Exception:
                        logger.exception(
                            "Could not start Meta OAuth for client %s",
                            client_id,
                        )
                        st.error(
                            "Could not start Meta authorization. "
                            "Check the server logs for details."
                        )
                    else:
                        st.rerun()

                auth_url = authorization_links.get(client_id)
                if auth_url:
                    st.link_button(
                        "Continue to Meta authorization",
                        url=auth_url,
                        key=f"continue_meta_oauth_{client_id}",
                        use_container_width=True,
                    )
                    st.caption(
                        "This authorization link expires after 10 minutes. "
                        "If it expires, generate a new link."
                    )

            created_at = client.get("created_at")
            if created_at:
                st.caption(f"Added: {str(created_at)[:19]}")

            with st.expander("Remove client"):
                st.warning(
                    "This removes the client record from Shryxa Ads. "
                    "It does not delete the Facebook Page or Meta ad account."
                )

                confirmed = st.checkbox(
                    "I confirm that I want to remove this client.",
                    key=f"confirm_delete_client_{client_id}",
                )

                if st.button(
                    "Delete client",
                    key=f"delete_client_{client_id}",
                    disabled=not confirmed,
                ):
                    try:
                        db.remove_client(client_id, user_id)
                    except Exception:
                        logger.exception(
                            "Failed to remove client ID %s", client_id
                        )
                        st.error(
                            "Could not remove this client. "
                            "Check the server logs for details."
                        )
                    else:
                        links = st.session_state.get(
                            "_meta_oauth_authorization_links", {}
                        )
                        links.pop(client_id, None)
                        st.session_state[
                            "_meta_oauth_authorization_links"
                        ] = links
                        st.success("Client record removed.")
                        st.rerun()
