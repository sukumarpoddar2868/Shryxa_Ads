import json
import os
import sqlite3
import stat
from datetime import datetime, timezone
from pathlib import Path

import psycopg
import requests
from dotenv import load_dotenv


ROOT = Path(__file__).resolve().parent.parent
ENV_PATH = ROOT / ".env"
SQLITE_PATH = ROOT / "data" / "meta_ads.db"

load_dotenv(ENV_PATH, override=True)


def turso_url():
    url = os.environ["TURSO_DATABASE_URL"].strip()

    if url.startswith("libsql://"):
        url = "https://" + url[len("libsql://"):]
    elif url.startswith("wss://"):
        url = "https://" + url[len("wss://"):]

    return url.rstrip("/") + "/v2/pipeline"


def turso_query(sql):
    response = requests.post(
        turso_url(),
        headers={
            "Authorization": f"Bearer {os.environ['TURSO_AUTH_TOKEN'].strip()}",
            "Content-Type": "application/json",
        },
        json={
            "requests": [
                {
                    "type": "execute",
                    "stmt": {"sql": sql, "args": []},
                },
                {"type": "close"},
            ]
        },
        timeout=30,
    )
    response.raise_for_status()

    result = response.json()["results"][0]

    if result.get("type") != "ok":
        raise RuntimeError("Turso query failed; no merge was performed.")

    data = result["response"]["result"]
    columns = [column["name"] for column in data.get("cols", [])]

    def decode(cell):
        kind = cell.get("type")

        if kind == "null":
            return None
        if kind == "integer":
            return int(cell["value"])
        if kind == "float":
            return float(cell["value"])
        if kind == "blob":
            import base64
            return base64.b64decode(cell["base64"])

        return cell.get("value")

    return [
        dict(zip(columns, [decode(cell) for cell in row]))
        for row in data.get("rows", [])
    ]


def read_sqlite_user():
    with sqlite3.connect(
        f"file:{SQLITE_PATH}?mode=ro", uri=True
    ) as conn:
        conn.row_factory = sqlite3.Row
        row = conn.execute(
            "SELECT id, email, is_admin FROM users WHERE id = 1"
        ).fetchone()

        if row is None:
            raise RuntimeError("Expected local SQLite user ID 1 was not found.")

        return dict(row)


def backup_supabase(database_url):
    timestamp = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%SZ")
    backup_path = ROOT / "data" / f"supabase_pre_turso_merge_{timestamp}.json"

    tables = ("users", "subscriptions", "clients", "sessions")
    snapshot = {}

    with psycopg.connect(database_url, connect_timeout=10) as conn:
        with conn.cursor() as cur:
            for table in tables:
                cur.execute(f"SELECT * FROM public.{table}")
                columns = [d.name for d in cur.description]
                snapshot[table] = [
                    dict(zip(columns, row))
                    for row in cur.fetchall()
                ]

    # The backup contains password hashes and may contain payment IDs.
    # Create it with owner-only permissions.
    backup_path.parent.mkdir(parents=True, exist_ok=True)
    fd = os.open(
        backup_path,
        os.O_WRONLY | os.O_CREAT | os.O_EXCL,
        stat.S_IRUSR | stat.S_IWUSR,
    )

    with os.fdopen(fd, "w", encoding="utf-8") as file:
        json.dump(snapshot, file, indent=2, default=str)

    return backup_path, snapshot


def insert_rows(cur, table, rows):
    if not rows:
        return

    columns = list(rows[0].keys())
    column_sql = ", ".join(columns)
    placeholders = ", ".join(["%s"] * len(columns))

    sql = (
        f"INSERT INTO public.{table} ({column_sql}) "
        f"VALUES ({placeholders})"
    )

    cur.executemany(
        sql,
        [tuple(row[column] for column in columns) for row in rows],
    )


def main():
    database_url = os.environ.get("DATABASE_URL", "").strip()
    turso_token = os.environ.get("TURSO_AUTH_TOKEN", "").strip()

    if not database_url or not turso_token:
        raise RuntimeError(
            "DATABASE_URL or TURSO_AUTH_TOKEN is missing."
        )

    if not SQLITE_PATH.exists():
        raise RuntimeError("Local SQLite database is missing.")

    # Read production records without modifying Turso.
    cloud_users = turso_query("SELECT * FROM users ORDER BY id")
    cloud_subscriptions = turso_query(
        "SELECT * FROM subscriptions ORDER BY user_id"
    )
    cloud_clients = turso_query("SELECT * FROM clients ORDER BY id")

    # Require the exact source state we inspected.
    if [u["id"] for u in cloud_users] != [1, 2, 3]:
        raise RuntimeError(
            "Turso user IDs changed since inspection. Merge stopped."
        )

    if len(cloud_subscriptions) != 3:
        raise RuntimeError(
            "Turso subscription count changed. Merge stopped."
        )

    if cloud_clients:
        raise RuntimeError(
            "Turso now contains clients. Reinspect before merging."
        )

    admin = next(u for u in cloud_users if u["id"] == 2)
    if admin.get("is_admin") != 1:
        raise RuntimeError(
            "Turso user ID 2 is no longer marked as Admin. Merge stopped."
        )

    if len({u["email"].strip().lower() for u in cloud_users}) != len(cloud_users):
        raise RuntimeError("Turso contains duplicate user emails.")

    local_user = read_sqlite_user()
    cloud_user_3 = next(u for u in cloud_users if u["id"] == 3)

    if (
        local_user["email"].strip().lower()
        != cloud_user_3["email"].strip().lower()
    ):
        raise RuntimeError(
            "The local/Turso matching email changed. Merge stopped."
        )

    print("Turso source: 3 users, 3 subscriptions, 0 clients.")
    print("Old sessions will not be migrated.")
    print("Admin account: user ID 2.")
    print("Preparing a private backup of the current Supabase data...")

    backup_path, snapshot = backup_supabase(database_url)
    print(f"Backup created: {backup_path}")

    # Confirm Supabase still contains exactly the state we expect.
    users_before = snapshot["users"]
    subscriptions_before = snapshot["subscriptions"]

    if (
        len(users_before) != 1
        or users_before[0]["id"] != 1
        or len(subscriptions_before) != 1
        or subscriptions_before[0]["user_id"] != 1
        or snapshot["clients"]
        or snapshot["sessions"]
    ):
        raise RuntimeError(
            "Supabase differs from the expected initial state. "
            "Backup was created, but no merge was performed."
        )

    local_email = local_user["email"].strip().lower()
    target_email = users_before[0]["email"].strip().lower()

    if local_email != target_email:
        raise RuntimeError(
            "Supabase user ID 1 no longer matches the expected local user."
        )

    # Replace the initial local-only account with Turso's production account
    # ID 1, then insert the other production accounts.
    # PostgreSQL rolls the whole transaction back if any step fails.
    with psycopg.connect(database_url, connect_timeout=10) as conn:
        with conn.cursor() as cur:
            cur.execute(
                "SELECT id FROM public.users ORDER BY id"
            )
            if [row[0] for row in cur.fetchall()] != [1]:
                raise RuntimeError("Supabase users changed during preparation.")

            first_user = cloud_users[0]
            update_columns = [
                column for column in first_user if column != "id"
            ]

            cur.execute(
                "UPDATE public.users SET "
                + ", ".join(f"{column} = %s" for column in update_columns)
                + " WHERE id = %s",
                tuple(first_user[column] for column in update_columns)
                + (1,),
            )

            insert_rows(
                cur,
                "users",
                [u for u in cloud_users if u["id"] != 1],
            )

            # Replace the local-only subscription with the production
            # subscription records from Turso.
            cur.execute("DELETE FROM public.subscriptions")
            insert_rows(cur, "subscriptions", cloud_subscriptions)

            # Client records are known to be empty in both sources.
            # Sessions intentionally remain empty.

            # Synchronize the identity sequence for future registrations.
            cur.execute("""
                SELECT setval(
                    pg_get_serial_sequence('public.users', 'id'),
                    (SELECT MAX(id) FROM public.users),
                    true
                )
            """)

            # Verify the merged state before committing.
            cur.execute("""
                SELECT id, is_admin
                FROM public.users
                ORDER BY id
            """)
            roles = cur.fetchall()

            if roles != [(1, 0), (2, 1), (3, 0)]:
                raise RuntimeError(
                    f"Unexpected user IDs or roles after merge: {roles}"
                )

            cur.execute("SELECT COUNT(*) FROM public.subscriptions")
            if cur.fetchone()[0] != 3:
                raise RuntimeError("Subscription count verification failed.")

            cur.execute("SELECT COUNT(*) FROM public.clients")
            if cur.fetchone()[0] != 0:
                raise RuntimeError("Unexpected client records.")

            cur.execute("SELECT COUNT(*) FROM public.sessions")
            if cur.fetchone()[0] != 0:
                raise RuntimeError("Unexpected session records.")

    # The connection context commits only after successful verification.
    print("\nMerge completed successfully.")
    print("Supabase users: 3")
    print("Supabase subscriptions: 3")
    print("Supabase clients: 0")
    print("Supabase sessions: 0")
    print("Admin user ID 2 preserved.")
    print("Turso and SQLite remain unchanged.")


if __name__ == "__main__":
    main()
