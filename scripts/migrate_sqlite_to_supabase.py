import os
import sqlite3
from pathlib import Path

import psycopg
from dotenv import load_dotenv


# Project paths
ROOT = Path(__file__).resolve().parent.parent
SQLITE_PATH = ROOT / "data" / "meta_ads.db"
ENV_PATH = ROOT / ".env"

TABLES = ("users", "subscriptions", "clients", "sessions")


def migrate():
    # Load the project's environment configuration.
    load_dotenv(ENV_PATH)

    database_url = os.environ.get("DATABASE_URL")
    if not database_url:
        raise RuntimeError("DATABASE_URL is missing from the project .env")

    if not SQLITE_PATH.exists():
        raise FileNotFoundError(f"SQLite database not found: {SQLITE_PATH}")

    # Read the source database without modifying it.
    with sqlite3.connect(f"file:{SQLITE_PATH}?mode=ro", uri=True) as source:
        source.row_factory = sqlite3.Row

        source_data = {
            table: [dict(row) for row in source.execute(
                f"SELECT * FROM {table}"
            ).fetchall()]
            for table in TABLES
        }

    print("Source SQLite record counts:")
    for table in TABLES:
        print(f"  {table}: {len(source_data[table])}")

    # Check that source tables contain the expected columns.
    expected_columns = {
        "users": {
            "id", "email", "password_hash", "currency", "tier",
            "client_limit", "team_seats", "is_admin",
            "created_at", "trial_ends_at",
        },
        "subscriptions": {
            "user_id", "status", "provider",
            "razorpay_subscription_id", "razorpay_customer_id",
            "current_period_end", "paused_campaign_ids",
            "last_polled_at",
        },
        "clients": {
            "id", "user_id", "ad_account_id", "page_id",
            "business_name", "created_at",
        },
        "sessions": {
            "token", "user_id", "created_at", "expires_at",
        },
    }

    for table, required in expected_columns.items():
        actual = set(source_data[table][0]) if source_data[table] else set()

        if actual and actual != required:
            raise RuntimeError(
                f"Unexpected columns in SQLite table {table}: {actual}"
            )

    # Verify that the target schema exists and is empty.
    # Nothing is inserted unless all four target tables are empty.
    with psycopg.connect(database_url, connect_timeout=10) as target:
        with target.cursor() as cur:
            for table in TABLES:
                cur.execute(
                    f"SELECT COUNT(*) FROM public.{table}"
                )
                count = cur.fetchone()[0]

                if count != 0:
                    raise RuntimeError(
                        f"Supabase table {table} contains {count} records. "
                        "Migration stopped without inserting data."
                    )

            # Insert parent records before related records.
            users = source_data["users"]
            if users:
                columns = list(users[0].keys())
                sql = (
                    f"INSERT INTO public.users "
                    f"({', '.join(columns)}) "
                    f"VALUES ({', '.join(['%s'] * len(columns))})"
                )
                cur.executemany(
                    sql,
                    [tuple(row[c] for c in columns) for row in users],
                )

            subscriptions = source_data["subscriptions"]
            if subscriptions:
                columns = list(subscriptions[0].keys())
                sql = (
                    f"INSERT INTO public.subscriptions "
                    f"({', '.join(columns)}) "
                    f"VALUES ({', '.join(['%s'] * len(columns))})"
                )
                cur.executemany(
                    sql,
                    [
                        tuple(row[c] for c in columns)
                        for row in subscriptions
                    ],
                )

            clients = source_data["clients"]
            if clients:
                columns = list(clients[0].keys())
                sql = (
                    f"INSERT INTO public.clients "
                    f"({', '.join(columns)}) "
                    f"VALUES ({', '.join(['%s'] * len(columns))})"
                )
                cur.executemany(
                    sql,
                    [tuple(row[c] for c in columns) for row in clients],
                )

            # Do not migrate old sessions. Users will log in again.
            # This avoids carrying existing authentication tokens over.

            # Synchronize PostgreSQL identity sequences after preserving IDs.
            for table in ("users", "clients"):
                cur.execute(
                    f"""
                    SELECT setval(
                        pg_get_serial_sequence('public.{table}', 'id'),
                        COALESCE(MAX(id), 1),
                        MAX(id) IS NOT NULL
                    )
                    FROM public.{table}
                    """
                )

            # Verify the inserted records inside the same transaction.
            expected_counts = {
                "users": len(users),
                "subscriptions": len(subscriptions),
                "clients": len(clients),
                "sessions": 0,
            }

            for table, expected in expected_counts.items():
                cur.execute(
                    f"SELECT COUNT(*) FROM public.{table}"
                )
                actual = cur.fetchone()[0]

                if actual != expected:
                    raise RuntimeError(
                        f"Verification failed for {table}: "
                        f"expected {expected}, found {actual}"
                    )

        # Successful exit commits the transaction.
        # Any exception rolls back all inserts.

    print("\nMigration completed successfully.")
    print("Supabase record counts:")
    for table, count in expected_counts.items():
        print(f"  {table}: {count}")

    print("\nExisting user IDs and Admin flags:")
    for user in source_data["users"]:
        print(
            f"  user_id={user['id']}, "
            f"is_admin={user['is_admin']}"
        )

    print("\nExisting login sessions were not migrated.")
    print("The original SQLite database remains unchanged.")


if __name__ == "__main__":
    migrate()
