import sqlite3

from fastapi.testclient import TestClient

from app.database import SCHEMA_VERSION, migrate
from app.main import app
from app.seed import initialize_database

# The original single-board MVP schema (version 1, user_version never set), with its seed rows.
LEGACY_DATABASE = """
CREATE TABLE users (
    id TEXT PRIMARY KEY, username TEXT NOT NULL UNIQUE, password_hash TEXT NOT NULL, created_at TEXT NOT NULL
);
CREATE TABLE boards (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
    name TEXT NOT NULL, created_at TEXT NOT NULL, updated_at TEXT NOT NULL
);
CREATE TABLE columns (
    id TEXT PRIMARY KEY,
    board_id TEXT NOT NULL REFERENCES boards(id) ON DELETE CASCADE,
    title TEXT NOT NULL, position INTEGER NOT NULL, created_at TEXT NOT NULL, updated_at TEXT NOT NULL,
    UNIQUE(board_id, position), UNIQUE(board_id, id)
);
CREATE TABLE cards (
    id TEXT PRIMARY KEY,
    board_id TEXT NOT NULL REFERENCES boards(id) ON DELETE CASCADE,
    column_id TEXT NOT NULL, title TEXT NOT NULL, details TEXT NOT NULL DEFAULT '', position INTEGER NOT NULL,
    created_at TEXT NOT NULL, updated_at TEXT NOT NULL,
    FOREIGN KEY(board_id, column_id) REFERENCES columns(board_id, id) ON DELETE CASCADE,
    UNIQUE(column_id, position)
);
CREATE INDEX idx_boards_user_id ON boards(user_id);
CREATE INDEX idx_columns_board_position ON columns(board_id, position);
CREATE INDEX idx_cards_board_column_position ON cards(board_id, column_id, position);
INSERT INTO users VALUES ('u1', 'user', 'mvp-placeholder', '2026-01-01T00:00:00+00:00');
INSERT INTO boards VALUES ('b1', 'u1', 'Project Board', '2026-01-01T00:00:00+00:00', '2026-01-01T00:00:00+00:00');
INSERT INTO columns VALUES ('col-backlog', 'b1', 'Ideas', 0, '2026-01-01', '2026-01-01');
INSERT INTO columns VALUES ('col-done', 'b1', 'Done', 1, '2026-01-01', '2026-01-01');
INSERT INTO cards VALUES ('card-1', 'b1', 'col-backlog', 'Kept card', 'Kept details', 0, '2026-01-01', '2026-01-01');
"""


def schema_of(path) -> dict:
    connection = sqlite3.connect(path)
    try:
        tables = [row[0] for row in connection.execute("SELECT name FROM sqlite_master WHERE type = 'table'")]
        return {
            "version": connection.execute("PRAGMA user_version").fetchone()[0],
            "columns": {
                table: sorted(tuple(row[1:]) for row in connection.execute(f"PRAGMA table_info({table})"))
                for table in sorted(tables)
            },
            # (table, index, unique, [(column, collation)]) covers UNIQUE constraints and COLLATE NOCASE.
            "indexes": sorted(
                (
                    table,
                    index[1],
                    index[2],
                    [(info[2], info[4]) for info in connection.execute(f"PRAGMA index_xinfo('{index[1]}')") if info[5]],
                )
                for table in tables
                for index in connection.execute(f"PRAGMA index_list({table})")
            ),
            "foreign_keys": {
                table: sorted(tuple(row[2:]) for row in connection.execute(f"PRAGMA foreign_key_list({table})"))
                for table in sorted(tables)
            },
        }
    finally:
        connection.close()


def make_legacy_database(path) -> None:
    connection = sqlite3.connect(path)
    connection.executescript(LEGACY_DATABASE)
    connection.close()


def test_fresh_database_gets_latest_schema(tmp_path):
    path = tmp_path / "nested" / "app.db"

    migrate(path)
    migrate(path)

    assert schema_of(path)["version"] == SCHEMA_VERSION


def test_legacy_database_migrates_to_the_fresh_schema(tmp_path):
    fresh, legacy = tmp_path / "fresh.db", tmp_path / "legacy.db"
    migrate(fresh)
    make_legacy_database(legacy)

    migrate(legacy)

    assert schema_of(legacy) == schema_of(fresh)


def test_legacy_data_survives_and_demo_password_works(tmp_path):
    path = tmp_path / "legacy.db"
    make_legacy_database(path)
    app.state.database_path = path

    with TestClient(app) as client:
        assert client.post("/api/auth/login", json={"username": "user", "password": "password"}).status_code == 200
        boards = client.get("/api/boards").json()
        assert [(board["id"], board["name"], board["card_count"]) for board in boards] == [("b1", "Project Board", 1)]
        board = client.get("/api/boards/b1").json()
        assert [column["title"] for column in board["columns"]] == ["Ideas", "Done"]
        assert board["cards"]["card-1"] == {
            "id": "card-1",
            "title": "Kept card",
            "details": "Kept details",
            "priority": "none",
            "due_date": None,
        }
        # The migrated user can now own more than one board.
        assert client.post("/api/boards", json={"name": "Second"}).status_code == 201


def test_seed_runs_once(tmp_path):
    path = tmp_path / "app.db"
    initialize_database(path)
    initialize_database(path)

    connection = sqlite3.connect(path)
    assert connection.execute("SELECT COUNT(*) FROM users").fetchone()[0] == 1
    assert connection.execute("SELECT COUNT(*) FROM cards").fetchone()[0] == 8
    connection.close()
