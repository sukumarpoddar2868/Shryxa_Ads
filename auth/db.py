"""
Supabase PostgreSQL database adapter for Shryxa Ads.

Both local development and cloud deployment use the same PostgreSQL database.

Local development:
    DATABASE_URL is loaded from the project's root .env file.

Cloud deployment:
    DATABASE_URL must be configured in the hosting provider's environment.

Important:
    - This adapter does not create, reset, or seed database tables.
    - Existing user IDs, password hashes, Admin permissions, and
      subscription records are preserved.
    - Turso and the local SQLite database are not modified.
"""

from __future__ import annotations

import json
import os
import uuid
import hashlib
import secrets

from contextlib import contextmanager
from datetime import datetime, timedelta, timezone
from pathlib import Path

import psycopg
from psycopg.rows import dict_row


# ---------------------------------------------------------------------
# Environment configuration
# ---------------------------------------------------------------------

ROOT_DIR = Path(__file__).resolve().parent.parent
DB_PATH = ROOT_DIR / "data" / "meta_ads.db"

# Load the root .env for local development.
# Existing environment variables take precedence, which is important
# for cloud deployments.
try:
    from dotenv import load_dotenv

    load_dotenv(dotenv_path=ROOT_DIR / ".env", override=False)
except ImportError:
    # Cloud environments can provide DATABASE_URL directly without
    # requiring python-dotenv.
    pass


def _database_url() -> str:
    """Return the PostgreSQL connection URL or raise a clear error."""
    url = os.environ.get("DATABASE_URL", "").strip()

    if not url:
        raise RuntimeError(
            "DATABASE_URL is not configured. "
            "Set it in the project's root .env for local development "
            "or in your cloud deployment environment."
        )

    if not url.startswith(("postgresql://", "postgres://")):
        raise RuntimeError(
            "DATABASE_URL must be a PostgreSQL connection URL."
        )

    return url


def _connect():
    """Create a PostgreSQL connection returning dictionary rows."""
    return psycopg.connect(
        _database_url(),
        row_factory=dict_row,
        connect_timeout=10,
    )


# ---------------------------------------------------------------------
# SQL helpers
# ---------------------------------------------------------------------

def _params_tuple(params: tuple | list | None) -> tuple:
    """Normalize SQL parameters to a tuple."""
    if params is None:
        return ()

    return tuple(params)


def _postgres_sql(sql: str) -> str:
    """
    Convert the existing adapter's simple SQLite-style placeholders
    to PostgreSQL placeholders.

    Application queries use '?' only for parameter placeholders.
    Do not use this helper for SQL containing literal question marks.
    """
    return sql.replace("?", "%s")


def _execute(
    sql: str,
    params: tuple | list | None = None,
) -> dict:
    """
    Execute a single INSERT, UPDATE, or DELETE statement.

    Returns:
        {
            "lastrowid": None,
            "rowcount": affected_rows
        }

    Functions that need generated IDs use RETURNING id explicitly.
    """
    params = _params_tuple(params)
    sql = _postgres_sql(sql)

    with _connect() as connection:
        with connection.cursor() as cursor:
            cursor.execute(sql, params)

            return {
                "lastrowid": None,
                "rowcount": cursor.rowcount,
            }


def _fetchone(
    sql: str,
    params: tuple | list | None = None,
) -> dict | None:
    """Fetch one row as a dictionary, or return None."""
    params = _params_tuple(params)
    sql = _postgres_sql(sql)

    with _connect() as connection:
        with connection.cursor() as cursor:
            cursor.execute(sql, params)
            row = cursor.fetchone()

            return dict(row) if row is not None else None


def _fetchall(
    sql: str,
    params: tuple | list | None = None,
) -> list[dict]:
    """Fetch all rows as dictionaries."""
    params = _params_tuple(params)
    sql = _postgres_sql(sql)

    with _connect() as connection:
        with connection.cursor() as cursor:
            cursor.execute(sql, params)

            return [dict(row) for row in cursor.fetchall()]


# ---------------------------------------------------------------------
# Schema validation
# ---------------------------------------------------------------------

def _init() -> None:
    """
    Verify that the required Supabase tables already exist.

    Deliberately does not create or modify tables. The existing
    production data and schema must be preserved during migration.
    """
    required_tables = (
        "users",
        "subscriptions",
        "clients",
        "sessions",
    )

    with _connect() as connection:
        with connection.cursor() as cursor:
            for table in required_tables:
                cursor.execute(
                    """
                    SELECT EXISTS (
                        SELECT 1
                        FROM information_schema.tables
                        WHERE table_schema = 'public'
                          AND table_name = %s
                    ) AS table_exists
                    """,
                    (table,),
                )

                result = cursor.fetchone()

                if not result or not result["table_exists"]:
                    raise RuntimeError(
                        f"Required table public.{table} does not exist "
                        "in Supabase. No tables were created or changed."
                    )


# Validate the database connection and schema when the module loads.
_init()


# ---------------------------------------------------------------------
# Backwards-compatible connection context manager
# ---------------------------------------------------------------------

@contextmanager
def conn():
    """
    Provide a PostgreSQL connection for older test scripts.

    This context manager now yields a psycopg connection rather than
    a SQLite connection. SQL passed directly to it must use PostgreSQL
    syntax and %s placeholders.
    """
    with _connect() as connection:
        yield connection


# ---------------------------------------------------------------------
# Date and time helpers
# ---------------------------------------------------------------------

def now_iso() -> str:
    """Return the current UTC timestamp as an ISO 8601 string."""
    return datetime.now(timezone.utc).isoformat()


def days_from_now(days: int) -> str:
    """Return a UTC ISO 8601 timestamp a given number of days ahead."""
    return (
        datetime.now(timezone.utc) + timedelta(days=days)
    ).isoformat()


def parse_iso(s: str | None) -> datetime | None:
    """Parse an ISO 8601 timestamp, returning None if invalid."""
    if not s:
        return None

    try:
        value = datetime.fromisoformat(s)

        # Support legacy timestamps without timezone information.
        if value.tzinfo is None:
            value = value.replace(tzinfo=timezone.utc)

        return value

    except (ValueError, TypeError):
        return None


# ---------------------------------------------------------------------
# Users
# ---------------------------------------------------------------------

def create_user(
    email: str,
    password_hash: str,
    currency: str = "INR",
    trial_days: int = 2,
) -> int:
    """
    Create a user and their initial subscription atomically.

    Returns the generated user ID.

    If either insertion fails, the transaction rolls back so that
    a user cannot be created without their subscription.
    """
    created_at = now_iso()
    trial_ends_at = days_from_now(trial_days)

    with _connect() as connection:
        with connection.cursor() as cursor:
            cursor.execute(
                """
                INSERT INTO public.users (
                    email,
                    password_hash,
                    currency,
                    created_at,
                    trial_ends_at
                )
                VALUES (%s, %s, %s, %s, %s)
                RETURNING id
                """,
                (
                    email,
                    password_hash,
                    currency,
                    created_at,
                    trial_ends_at,
                ),
            )

            row = cursor.fetchone()

            if row is None:
                raise RuntimeError("User creation did not return an ID.")

            user_id = int(row["id"])

            cursor.execute(
                """
                INSERT INTO public.subscriptions (
                    user_id,
                    status
                )
                VALUES (%s, 'trialing')
                """,
                (user_id,),
            )

            return user_id


def find_user_by_email(email: str) -> dict | None:
    """Find a user by email."""
    return _fetchone(
        "SELECT * FROM public.users WHERE email = ?",
        (email,),
    )


def find_user(user_id: int) -> dict | None:
    """Find a user by ID."""
    return _fetchone(
        "SELECT * FROM public.users WHERE id = ?",
        (user_id,),
    )


def list_users() -> list[dict]:
    """List users with their subscription status and period end."""
    return _fetchall(
        """
        SELECT
            u.*,
            s.status AS sub_status,
            s.current_period_end
        FROM public.users AS u
        LEFT JOIN public.subscriptions AS s
            ON s.user_id = u.id
        ORDER BY u.created_at DESC
        """
    )


def update_user_tier(
    user_id: int,
    tier: str,
    client_limit: int,
    team_seats: int,
) -> None:
    """Update a user's plan and limits."""
    _execute(
        """
        UPDATE public.users
        SET tier = ?, client_limit = ?, team_seats = ?
        WHERE id = ?
        """,
        (tier, client_limit, team_seats, user_id),
    )


def make_admin(user_id: int) -> None:
    """Grant Admin privileges to an existing user."""
    _execute(
        "UPDATE public.users SET is_admin = 1 WHERE id = ?",
        (user_id,),
    )
# ---------------------------------------------------------------------
# Subscriptions
# ---------------------------------------------------------------------

def get_subscription(user_id: int) -> dict | None:
    """Fetch a subscription and decode its paused campaign IDs."""
    row = _fetchone(
        "SELECT * FROM public.subscriptions WHERE user_id = ?",
        (user_id,),
    )

    if not row:
        return None

    paused_campaign_ids = row.get("paused_campaign_ids")

    if isinstance(paused_campaign_ids, str):
        try:
            row["paused_campaign_ids"] = json.loads(
                paused_campaign_ids or "[]"
            )
        except json.JSONDecodeError:
            row["paused_campaign_ids"] = []
    elif paused_campaign_ids is None:
        row["paused_campaign_ids"] = []
    elif not isinstance(paused_campaign_ids, list):
        row["paused_campaign_ids"] = []

    return row


def set_subscription_status(
    user_id: int,
    status: str,
    period_end: str | None = None,
) -> None:
    """Update subscription status and polling timestamp."""
    if period_end:
        _execute(
            """
            UPDATE public.subscriptions
            SET status = ?,
                current_period_end = ?,
                last_polled_at = ?
            WHERE user_id = ?
            """,
            (status, period_end, now_iso(), user_id),
        )
    else:
        _execute(
            """
            UPDATE public.subscriptions
            SET status = ?,
                last_polled_at = ?
            WHERE user_id = ?
            """,
            (status, now_iso(), user_id),
        )


def set_razorpay_ids(
    user_id: int,
    subscription_id: str | None,
    customer_id: str | None,
) -> None:
    """Save Razorpay identifiers for a subscription."""
    _execute(
        """
        UPDATE public.subscriptions
        SET razorpay_subscription_id = ?,
            razorpay_customer_id = ?,
            provider = 'razorpay'
        WHERE user_id = ?
        """,
        (subscription_id, customer_id, user_id),
    )


def set_paused_campaigns(
    user_id: int,
    campaign_ids: list[str],
) -> None:
    """Save paused campaign IDs as a JSON string."""
    _execute(
        """
        UPDATE public.subscriptions
        SET paused_campaign_ids = ?
        WHERE user_id = ?
        """,
        (json.dumps(campaign_ids), user_id),
    )


def extend_subscription(user_id: int, days: int = 30) -> None:
    """Manually extend a subscription from the current UTC time."""
    end = (
        datetime.now(timezone.utc) + timedelta(days=days)
    ).isoformat()

    _execute(
        """
        UPDATE public.subscriptions
        SET status = 'active',
            current_period_end = ?,
            provider = COALESCE(provider, 'manual')
        WHERE user_id = ?
        """,
        (end, user_id),
    )


# ---------------------------------------------------------------------
# Clients
# ---------------------------------------------------------------------

def add_client(
    user_id: int,
    ad_account_id: str,
    page_id: str = "",
    business_name: str = "",
    service_model: str = "self_service",
    billing_arrangement: str | None = None,
    client_status: str = "pending_access",
) -> int:
    """Add a client belonging to a user and return its generated ID."""
    from psycopg.errors import UniqueViolation

    ad_account_id = (ad_account_id or "").strip()
    page_id = (page_id or "").strip()
    business_name = (business_name or "").strip()

    if not ad_account_id:
        raise ValueError("Ad Account ID is required.")

    if not business_name:
        raise ValueError("Business name is required.")

    if service_model not in ("agency_managed", "self_service"):
        raise ValueError("Invalid service model.")

    if client_status not in ("pending_access", "active", "paused"):
        raise ValueError("Invalid client status.")

    allowed_billing = (
        "management_fee_only",
        "management_plus_ad_budget",
    )

    if service_model == "self_service":
        billing_arrangement = None
    elif billing_arrangement not in allowed_billing:
        raise ValueError(
            "Choose a billing arrangement for agency-managed clients."
        )

    try:
        with _connect() as connection:
            with connection.cursor() as cursor:
                cursor.execute(
                    """
                    INSERT INTO public.clients (
                        user_id,
                        ad_account_id,
                        page_id,
                        business_name,
                        created_at,
                        service_model,
                        billing_arrangement,
                        client_status
                    )
                    VALUES (%s, %s, %s, %s, %s, %s, %s, %s)
                    RETURNING id
                    """,
                    (
                        user_id,
                        ad_account_id,
                        page_id or None,
                        business_name,
                        now_iso(),
                        service_model,
                        billing_arrangement,
                        client_status,
                    ),
                )

                row = cursor.fetchone()

                if row is None:
                    raise RuntimeError(
                        "Client creation did not return an ID."
                    )

                return int(row["id"])

    except UniqueViolation as exc:
        raise ValueError(
            "This Ad Account ID is already registered in your workspace."
        ) from exc


def list_clients(user_id: int) -> list[dict]:
    """List clients belonging only to the specified user."""
    return _fetchall(
        """
        SELECT *
        FROM public.clients
        WHERE user_id = ?
        ORDER BY created_at DESC, id DESC
        """,
        (user_id,),
    )


def client_count(user_id: int) -> int:
    """Count a user's registered clients."""
    row = _fetchone(
        """
        SELECT COUNT(*) AS n
        FROM public.clients
        WHERE user_id = ?
        """,
        (user_id,),
    )

    return int(row["n"]) if row else 0


def remove_client(client_id: int, user_id: int) -> None:
    """Delete a client only when it belongs to the specified user."""
    _execute(
        """
        DELETE FROM public.clients
        WHERE id = ? AND user_id = ?
        """,
        (client_id, user_id),
    )


# ---------------------------------------------------------------------
# Sessions
# ---------------------------------------------------------------------

def create_session(user_id: int, days_valid: int = 30) -> str:
    """Create a session token and persist it in PostgreSQL."""
    token = uuid.uuid4().hex

    _execute(
        """
        INSERT INTO public.sessions (
            token,
            user_id,
            created_at,
            expires_at
        )
        VALUES (?, ?, ?, ?)
        """,
        (token, user_id, now_iso(), days_from_now(days_valid)),
    )

    return token


def find_session(token: str) -> dict | None:
    """Find a session and delete it if it has expired."""
    row = _fetchone(
        "SELECT * FROM public.sessions WHERE token = ?",
        (token,),
    )

    if not row:
        return None

    expires_at = parse_iso(row.get("expires_at"))

    if expires_at and datetime.now(timezone.utc) > expires_at:
        delete_session(token)
        return None

    return row


def delete_session(token: str) -> None:
    """Delete a session by its token."""
    _execute(
        "DELETE FROM public.sessions WHERE token = ?",
        (token,),
    )


def delete_user_sessions(user_id: int) -> None:
    """Delete all sessions belonging to a user."""
    _execute(
        "DELETE FROM public.sessions WHERE user_id = ?",
        (user_id,),
    )
# ---------------------------------------------------------------------
# Client-specific Meta connections
# ---------------------------------------------------------------------

def save_meta_connection(
    user_id: int,
    client_id: int,
    ad_account_id: str,
    encrypted_access_token: str,
    meta_user_id: str | None = None,
    meta_user_name: str | None = None,
    ad_account_name: str | None = None,
    token_expires_at: datetime | None = None,
) -> int:
    """Save a Meta connection only for a client owned by the user."""
    from psycopg.errors import UniqueViolation

    ad_account_id = (ad_account_id or "").strip()
    encrypted_access_token = (encrypted_access_token or "").strip()

    if not ad_account_id:
        raise ValueError("Meta Ad Account ID is required.")

    if not encrypted_access_token:
        raise ValueError("Encrypted access token is required.")

    try:
        with _connect() as connection:
            with connection.cursor() as cursor:
                # Verify that this client belongs to the current user.
                cursor.execute(
                    """
                    SELECT id
                    FROM public.clients
                    WHERE id = %s AND user_id = %s
                    FOR UPDATE
                    """,
                    (client_id, user_id),
                )

                if cursor.fetchone() is None:
                    raise ValueError(
                        "Client not found in your workspace."
                    )

                # Keep the account ID used by existing campaign workflows
                # synchronized with the account selected during Meta OAuth.
                cursor.execute(
                    """
                    UPDATE public.clients
                    SET ad_account_id = %s
                    WHERE id = %s AND user_id = %s
                    """,
                    (ad_account_id, client_id, user_id),
                )

                cursor.execute(
                    """
                    INSERT INTO public.meta_connections (
                        user_id,
                        client_id,
                        meta_user_id,
                        meta_user_name,
                        ad_account_id,
                        ad_account_name,
                        access_token_encrypted,
                        token_expires_at,
                        connected_at,
                        updated_at,
                        connection_status
                    )
                    VALUES (
                        %s, %s, %s, %s, %s, %s, %s, %s,
                        NOW(), NOW(), 'connected'
                    )
                    ON CONFLICT (client_id)
                    DO UPDATE SET
                        user_id = EXCLUDED.user_id,
                        meta_user_id = EXCLUDED.meta_user_id,
                        meta_user_name = EXCLUDED.meta_user_name,
                        ad_account_id = EXCLUDED.ad_account_id,
                        ad_account_name = EXCLUDED.ad_account_name,
                        access_token_encrypted =
                            EXCLUDED.access_token_encrypted,
                        token_expires_at = EXCLUDED.token_expires_at,
                        updated_at = NOW(),
                        connection_status = 'connected'
                    WHERE public.meta_connections.user_id =
                        EXCLUDED.user_id
                    RETURNING id
                    """,
                    (
                        user_id,
                        client_id,
                        meta_user_id,
                        meta_user_name,
                        ad_account_id,
                        ad_account_name,
                        encrypted_access_token,
                        token_expires_at,
                    ),
                )

                row = cursor.fetchone()

                if row is None:
                    raise ValueError(
                        "This client connection belongs to another workspace."
                    )

                return int(row["id"])

    except UniqueViolation as exc:
        raise ValueError(
            "This Meta account conflicts with an existing connection."
        ) from exc


def get_meta_connection(
    user_id: int,
    client_id: int,
) -> dict | None:
    """Retrieve connection metadata only for a client owned by the user."""
    return _fetchone(
        """
        SELECT
            id,
            user_id,
            client_id,
            meta_user_id,
            meta_user_name,
            ad_account_id,
            ad_account_name,
            token_expires_at,
            connected_at,
            updated_at,
            connection_status
        FROM public.meta_connections
        WHERE user_id = ? AND client_id = ?
        """,
        (user_id, client_id),
    )


def get_meta_connection_for_token(
    user_id: int,
    client_id: int,
) -> dict | None:
    """Retrieve an encrypted token for a connection owned by the user."""
    return _fetchone(
        """
        SELECT
            id,
            user_id,
            client_id,
            ad_account_id,
            access_token_encrypted,
            token_expires_at,
            connection_status
        FROM public.meta_connections
        WHERE user_id = ? AND client_id = ?
        """,
        (user_id, client_id),
    )


def update_meta_connection_status(
    user_id: int,
    client_id: int,
    status: str,
) -> bool:
    """Update connection status only within the owner's workspace."""
    allowed_statuses = {
        "connected",
        "expired",
        "revoked",
        "error",
    }

    if status not in allowed_statuses:
        raise ValueError("Invalid Meta connection status.")

    result = _execute(
        """
        UPDATE public.meta_connections
        SET connection_status = ?,
            updated_at = NOW()
        WHERE user_id = ? AND client_id = ?
        """,
        (status, user_id, client_id),
    )

    return result["rowcount"] > 0


def remove_meta_connection(
    user_id: int,
    client_id: int,
) -> bool:
    """Remove a Meta connection only within the owner's workspace."""
    result = _execute(
        """
        DELETE FROM public.meta_connections
        WHERE user_id = ? AND client_id = ?
        """,
        (user_id, client_id),
    )

    return result["rowcount"] > 0


def list_meta_connections(user_id: int) -> list[dict]:
    """List connection metadata without returning access tokens."""
    return _fetchall(
        """
        SELECT
            id,
            client_id,
            meta_user_id,
            meta_user_name,
            ad_account_id,
            ad_account_name,
            token_expires_at,
            connected_at,
            updated_at,
            connection_status
        FROM public.meta_connections
        WHERE user_id = ?
        ORDER BY connected_at DESC
        """,
        (user_id,),
    )
# ---------------------------------------------------------------------
# Meta OAuth state management
# ---------------------------------------------------------------------

META_OAUTH_STATE_TTL_MINUTES = 10


def create_meta_oauth_state(user_id: int, client_id: int) -> str:
    """
    Generate a cryptographically random OAuth state and store its hash.

    The client must belong to the authenticated user.
    The raw state is returned to the caller but never stored in the DB.
    """
    if not isinstance(user_id, int) or user_id <= 0:
        raise ValueError("Invalid user ID.")

    if not isinstance(client_id, int) or client_id <= 0:
        raise ValueError("Invalid client ID.")

    state = secrets.token_urlsafe(32)
    state_hash = hashlib.sha256(state.encode("utf-8")).hexdigest()

    with _connect() as connection:
        with connection.cursor() as cursor:
            cursor.execute(
                """
                SELECT id
                FROM public.clients
                WHERE id = %s AND user_id = %s
                """,
                (client_id, user_id),
            )

            if cursor.fetchone() is None:
                raise ValueError("Client not found in your workspace.")

            cursor.execute(
                """
                INSERT INTO public.meta_oauth_states (
                    state_hash,
                    user_id,
                    client_id,
                    created_at,
                    expires_at
                )
                VALUES (
                    %s,
                    %s,
                    %s,
                    NOW(),
                    NOW() + (%s * INTERVAL '1 minute')
                )
                """,
                (
                    state_hash,
                    user_id,
                    client_id,
                    META_OAUTH_STATE_TTL_MINUTES,
                ),
            )

    return state


def consume_meta_oauth_state(state: str) -> dict | None:
    """
    Atomically consume a valid, unexpired OAuth state.

    Returns its user_id and client_id once, or None if invalid,
    expired, or already consumed.
    """
    if not isinstance(state, str) or not state or len(state) > 512:
        return None

    state_hash = hashlib.sha256(state.encode("utf-8")).hexdigest()

    with _connect() as connection:
        with connection.cursor() as cursor:
            cursor.execute(
                """
                DELETE FROM public.meta_oauth_states
                WHERE state_hash = %s
                  AND expires_at > NOW()
                RETURNING user_id, client_id
                """,
                (state_hash,),
            )

            row = cursor.fetchone()

    return dict(row) if row is not None else None


def cleanup_meta_oauth_states() -> int:
    """Delete expired OAuth state records and return the deleted count."""
    result = _execute(
        """
        DELETE FROM public.meta_oauth_states
        WHERE expires_at <= NOW()
        """
    )

    return result["rowcount"]


# ---------------------------------------------------------------------
# Pending client-specific Meta OAuth connections
# ---------------------------------------------------------------------

META_OAUTH_PENDING_TTL_MINUTES = 10


def create_meta_oauth_pending(
    user_id: int,
    client_id: int,
    encrypted_access_token: str,
    meta_user_id: str | None,
    meta_user_name: str | None,
    accounts: list[dict],
    token_expires_at: datetime | None = None,
) -> str:
    """
    Persist an encrypted, short-lived pending Meta connection.

    Returns a random, one-time ticket. Only its SHA-256 hash is stored.
    The access token must already be encrypted before calling this function.
    """
    from psycopg.types.json import Jsonb

    if not isinstance(user_id, int) or user_id <= 0:
        raise ValueError("Invalid user ID.")

    if not isinstance(client_id, int) or client_id <= 0:
        raise ValueError("Invalid client ID.")

    if (
        not isinstance(encrypted_access_token, str)
        or not encrypted_access_token
    ):
        raise ValueError("Encrypted access token is required.")

    if not isinstance(accounts, list) or not accounts:
        raise ValueError("At least one Meta ad account is required.")

    ticket = secrets.token_urlsafe(32)
    ticket_hash = hashlib.sha256(ticket.encode("utf-8")).hexdigest()

    with _connect() as connection:
        with connection.cursor() as cursor:
            # Verify that this client belongs to this user.
            cursor.execute(
                """
                SELECT id
                FROM public.clients
                WHERE id = %s AND user_id = %s
                """,
                (client_id, user_id),
            )

            if cursor.fetchone() is None:
                raise ValueError("Client not found in your workspace.")

            # Remove older pending attempts for this same client.
            cursor.execute(
                """
                DELETE FROM public.meta_oauth_pending
                WHERE user_id = %s
                  AND client_id = %s
                """,
                (user_id, client_id),
            )

            cursor.execute(
                """
                INSERT INTO public.meta_oauth_pending (
                    ticket_hash,
                    user_id,
                    client_id,
                    meta_user_id,
                    meta_user_name,
                    accounts,
                    access_token_encrypted,
                    token_expires_at,
                    created_at,
                    expires_at
                )
                VALUES (
                    %s, %s, %s, %s, %s, %s, %s, %s,
                    NOW(),
                    NOW() + (%s * INTERVAL '1 minute')
                )
                """,
                (
                    ticket_hash,
                    user_id,
                    client_id,
                    meta_user_id,
                    meta_user_name,
                    Jsonb(accounts),
                    encrypted_access_token,
                    token_expires_at,
                    META_OAUTH_PENDING_TTL_MINUTES,
                ),
            )

    # The raw ticket is returned once; it is never stored in the database.
    return ticket


def get_meta_oauth_pending(
    ticket: str,
    user_id: int,
) -> dict | None:
    """
    Retrieve an unexpired pending connection for the specified user.

    Does not consume the ticket. The ticket is consumed after saving the
    selected Meta account.
    """
    if not isinstance(ticket, str) or not ticket or len(ticket) > 512:
        return None

    if not isinstance(user_id, int) or user_id <= 0:
        return None

    ticket_hash = hashlib.sha256(ticket.encode("utf-8")).hexdigest()

    with _connect() as connection:
        with connection.cursor() as cursor:
            cursor.execute(
                """
                SELECT
                    id,
                    user_id,
                    client_id,
                    meta_user_id,
                    meta_user_name,
                    accounts,
                    access_token_encrypted,
                    token_expires_at,
                    created_at,
                    expires_at
                FROM public.meta_oauth_pending
                WHERE ticket_hash = %s
                  AND user_id = %s
                  AND expires_at > NOW()
                """,
                (ticket_hash, user_id),
            )

            row = cursor.fetchone()

    if row is None:
        return None

    result = dict(row)

    # psycopg normally decodes JSONB automatically, but handle either form.
    if isinstance(result.get("accounts"), str):
        try:
            result["accounts"] = json.loads(result["accounts"])
        except json.JSONDecodeError:
            return None

    if not isinstance(result.get("accounts"), list):
        return None

    return result


def consume_meta_oauth_pending(
    ticket: str,
    user_id: int,
) -> bool:
    """Delete a pending connection after it has been completed or cancelled."""
    if not isinstance(ticket, str) or not ticket or len(ticket) > 512:
        return False

    if not isinstance(user_id, int) or user_id <= 0:
        return False

    ticket_hash = hashlib.sha256(ticket.encode("utf-8")).hexdigest()

    with _connect() as connection:
        with connection.cursor() as cursor:
            cursor.execute(
                """
                DELETE FROM public.meta_oauth_pending
                WHERE ticket_hash = %s
                  AND user_id = %s
                RETURNING id
                """,
                (ticket_hash, user_id),
            )

            return cursor.fetchone() is not None


def cleanup_meta_oauth_pending() -> int:
    """Delete expired pending Meta connections."""
    result = _execute(
        """
        DELETE FROM public.meta_oauth_pending
        WHERE expires_at <= NOW()
        """
    )

    return result["rowcount"]
