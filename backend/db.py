"""SQLite helper layer for MentorMatch."""
import os
import sqlite3

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
DB_PATH = os.path.join(BASE_DIR, "mentormatch.db")
SCHEMA_PATH = os.path.join(BASE_DIR, "schema.sql")


def get_db():
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA foreign_keys = ON")
    return conn


def _migrate(conn):
    """Idempotently add columns introduced after first release."""
    cols = {r["name"] for r in conn.execute("PRAGMA table_info(users)")}
    add = {
        "avatar": "TEXT NOT NULL DEFAULT ''",
        "experience": "INTEGER NOT NULL DEFAULT 0",
        "price": "INTEGER NOT NULL DEFAULT 0",
        "verified": "INTEGER NOT NULL DEFAULT 0",
        "subscribed": "INTEGER NOT NULL DEFAULT 0",
        "bonus_points": "INTEGER NOT NULL DEFAULT 0",
        "completed_tasks": "INTEGER NOT NULL DEFAULT 0",
    }
    added = []
    for col, decl in add.items():
        if col not in cols:
            conn.execute(f"ALTER TABLE users ADD COLUMN {col} {decl}")
            added.append(col)
    conn.commit()
    # один раз, при первом появлении подписки — сделать пару демо-менторов PRO
    if "subscribed" in added:
        conn.execute("UPDATE users SET subscribed = 1 WHERE email IN ('anna@demo.io','maria@demo.io')")
        conn.execute("UPDATE users SET bonus_points = 40, completed_tasks = 4 WHERE email = 'pavel@demo.io'")
        conn.commit()


def init_db():
    """Create tables (idempotent), migrate, and seed demo data."""
    fresh = not os.path.exists(DB_PATH)
    conn = get_db()
    with open(SCHEMA_PATH, "r", encoding="utf-8") as f:
        conn.executescript(f.read())
    conn.commit()
    _migrate(conn)

    count = conn.execute("SELECT COUNT(*) AS c FROM users").fetchone()["c"]
    if count == 0:
        from seed import seed_demo
        seed_demo(conn)
    # догрузить демо отзывы/портфолио/верификацию один раз
    if conn.execute("SELECT COUNT(*) AS c FROM reviews").fetchone()["c"] == 0:
        from seed import enrich_demo
        enrich_demo(conn)
    conn.close()
    return fresh
