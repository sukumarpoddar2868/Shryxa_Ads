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
) -> int:
    """Add a client and return its generated ID."""
    with _connect() as connection:
        with connection.cursor() as cursor:
            cursor.execute(
                """
                INSERT INTO public.clients (
                    user_id,
                    ad_account_id,
                    page_id,
                    business_name,
                    created_at
                )
                VALUES (%s, %s, %s, %s, %s)
                RETURNING id
                """,
                (
                    user_id,
                    ad_account_id,
                    page_id,
                    business_name,
                    now_iso(),
                ),
            )

            row = cursor.fetchone()

            if row is None:
                raise RuntimeError("Client creation did not return an ID.")

            return int(row["id"])


def list_clients(user_id: int) -> list[dict]:
    """List clients belonging to a user."""
    return _fetchall(
        """
        SELECT *
        FROM public.clients
        WHERE user_id = ?
        ORDER BY created_at
        """,
        (user_id,),
    )


def client_count(user_id: int) -> int:
    """Count a user's clients."""
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
    """Remove a client only if it belongs to the specified user."""
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

