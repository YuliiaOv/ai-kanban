import sqlite3
from contextlib import contextmanager
from datetime import UTC, datetime
from pathlib import Path

SCHEMA = """
CREATE TABLE users (
    id TEXT PRIMARY KEY,
    username TEXT NOT NULL UNIQUE COLLATE NOCASE,
    display_name TEXT NOT NULL DEFAULT '',
    password_hash TEXT NOT NULL,
    created_at TEXT NOT NULL
);
CREATE TABLE sessions (
    token_hash TEXT PRIMARY KEY,
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    created_at TEXT NOT NULL,
    expires_at TEXT NOT NULL
);
CREATE TABLE boards (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    description TEXT NOT NULL DEFAULT '',
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
);
CREATE TABLE columns (
    id TEXT PRIMARY KEY,
    board_id TEXT NOT NULL REFERENCES boards(id) ON DELETE CASCADE,
    title TEXT NOT NULL,
    position INTEGER NOT NULL,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    UNIQUE(board_id, position),
    UNIQUE(board_id, id)
);
CREATE TABLE cards (
    id TEXT PRIMARY KEY,
    board_id TEXT NOT NULL REFERENCES boards(id) ON DELETE CASCADE,
    column_id TEXT NOT NULL,
    title TEXT NOT NULL,
    details TEXT NOT NULL DEFAULT '',
    position INTEGER NOT NULL,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    priority TEXT NOT NULL DEFAULT 'none',
    due_date TEXT,
    FOREIGN KEY(board_id, column_id) REFERENCES columns(board_id, id) ON DELETE CASCADE,
    UNIQUE(column_id, position)
);
CREATE INDEX idx_sessions_user_id ON sessions(user_id);
CREATE INDEX idx_boards_user_id ON boards(user_id);
CREATE INDEX idx_columns_board_position ON columns(board_id, position);
CREATE INDEX idx_cards_board_column_position ON cards(board_id, column_id, position);
"""

# MIGRATIONS[n] upgrades a database from version n + 1 to n + 2. Version 1 is the original single-board MVP schema.
# Each script runs in one transaction with foreign keys off, so tables can be rebuilt.
MIGRATIONS = [
    """
    CREATE TABLE users_new (
        id TEXT PRIMARY KEY,
        username TEXT NOT NULL UNIQUE COLLATE NOCASE,
        display_name TEXT NOT NULL DEFAULT '',
        password_hash TEXT NOT NULL,
        created_at TEXT NOT NULL
    );
    INSERT INTO users_new (id, username, password_hash, created_at)
        SELECT id, username, password_hash, created_at FROM users;
    DROP TABLE users;
    ALTER TABLE users_new RENAME TO users;
    CREATE TABLE sessions (
        token_hash TEXT PRIMARY KEY,
        user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        created_at TEXT NOT NULL,
        expires_at TEXT NOT NULL
    );
    CREATE INDEX idx_sessions_user_id ON sessions(user_id);
    CREATE TABLE boards_new (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        name TEXT NOT NULL,
        description TEXT NOT NULL DEFAULT '',
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
    );
    INSERT INTO boards_new (id, user_id, name, created_at, updated_at)
        SELECT id, user_id, name, created_at, updated_at FROM boards;
    DROP TABLE boards;
    ALTER TABLE boards_new RENAME TO boards;
    CREATE INDEX idx_boards_user_id ON boards(user_id);
    ALTER TABLE cards ADD COLUMN priority TEXT NOT NULL DEFAULT 'none';
    ALTER TABLE cards ADD COLUMN due_date TEXT;
    """,
]

SCHEMA_VERSION = len(MIGRATIONS) + 1


def utc_now() -> str:
    return datetime.now(UTC).isoformat()


@contextmanager
def connect(database_path: Path):
    database_path.parent.mkdir(parents=True, exist_ok=True)
    connection = sqlite3.connect(database_path)
    connection.row_factory = sqlite3.Row
    connection.execute("PRAGMA foreign_keys = ON")
    try:
        yield connection
    except Exception:
        connection.rollback()
        raise
    else:
        connection.commit()
    finally:
        connection.close()


def migrate(database_path: Path) -> None:
    """Create the schema in a new database, or upgrade an older one to SCHEMA_VERSION."""
    database_path.parent.mkdir(parents=True, exist_ok=True)
    connection = sqlite3.connect(database_path, autocommit=True)
    try:
        version = connection.execute("PRAGMA user_version").fetchone()[0]
        has_tables = connection.execute("SELECT 1 FROM sqlite_master WHERE name = 'users'").fetchone()
        if not has_tables:
            connection.executescript(f"BEGIN; {SCHEMA} PRAGMA user_version = {SCHEMA_VERSION}; COMMIT;")
            return
        # The original schema never set user_version.
        version = version or 1
        for index in range(version - 1, len(MIGRATIONS)):
            connection.executescript(f"BEGIN; {MIGRATIONS[index]} PRAGMA user_version = {index + 2}; COMMIT;")
        problems = connection.execute("PRAGMA foreign_key_check").fetchall()
        if problems:
            raise RuntimeError(f"Database migration left broken references: {problems}")
    finally:
        connection.close()
