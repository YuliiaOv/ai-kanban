import sqlite3
from contextlib import contextmanager
from datetime import UTC, datetime
from pathlib import Path
from typing import Any
from uuid import uuid4

INITIAL_COLUMNS = [
    ("col-backlog", "Backlog", 0),
    ("col-discovery", "Discovery", 1),
    ("col-progress", "In Progress", 2),
    ("col-review", "Review", 3),
    ("col-done", "Done", 4),
]

INITIAL_CARDS = [
    ("card-1", "Align roadmap themes", "Draft quarterly themes with impact statements and metrics.", "col-backlog", 0),
    ("card-2", "Gather customer signals", "Review support tags, sales notes, and churn feedback.", "col-backlog", 1),
    ("card-3", "Prototype analytics view", "Sketch initial dashboard layout and key drill-downs.", "col-discovery", 0),
    ("card-4", "Refine status language", "Standardize column labels and tone across the board.", "col-progress", 0),
    ("card-5", "Design card layout", "Add hierarchy and spacing for scanning dense lists.", "col-progress", 1),
    ("card-6", "QA micro-interactions", "Verify hover, focus, and loading states.", "col-review", 0),
    ("card-7", "Ship marketing page", "Final copy approved and asset pack delivered.", "col-done", 0),
    ("card-8", "Close onboarding sprint", "Document release notes and share internally.", "col-done", 1),
]

INSERT_CARD = (
    "INSERT INTO cards (id, board_id, column_id, title, details, position, created_at, updated_at) "
    "VALUES (?, ?, ?, ?, ?, ?, ?, ?)"
)


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


def initialize_database(database_path: Path) -> None:
    with connect(database_path) as connection:
        connection.executescript(
            """
            CREATE TABLE IF NOT EXISTS users (
                id TEXT PRIMARY KEY,
                username TEXT NOT NULL UNIQUE,
                password_hash TEXT NOT NULL,
                created_at TEXT NOT NULL
            );
            CREATE TABLE IF NOT EXISTS boards (
                id TEXT PRIMARY KEY,
                user_id TEXT NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
                name TEXT NOT NULL,
                created_at TEXT NOT NULL,
                updated_at TEXT NOT NULL
            );
            CREATE TABLE IF NOT EXISTS columns (
                id TEXT PRIMARY KEY,
                board_id TEXT NOT NULL REFERENCES boards(id) ON DELETE CASCADE,
                title TEXT NOT NULL,
                position INTEGER NOT NULL,
                created_at TEXT NOT NULL,
                updated_at TEXT NOT NULL,
                UNIQUE(board_id, position),
                UNIQUE(board_id, id)
            );
            CREATE TABLE IF NOT EXISTS cards (
                id TEXT PRIMARY KEY,
                board_id TEXT NOT NULL REFERENCES boards(id) ON DELETE CASCADE,
                column_id TEXT NOT NULL,
                title TEXT NOT NULL,
                details TEXT NOT NULL DEFAULT '',
                position INTEGER NOT NULL,
                created_at TEXT NOT NULL,
                updated_at TEXT NOT NULL,
                FOREIGN KEY(board_id, column_id) REFERENCES columns(board_id, id) ON DELETE CASCADE,
                UNIQUE(column_id, position)
            );
            CREATE INDEX IF NOT EXISTS idx_boards_user_id ON boards(user_id);
            CREATE INDEX IF NOT EXISTS idx_columns_board_position ON columns(board_id, position);
            CREATE INDEX IF NOT EXISTS idx_cards_board_column_position ON cards(board_id, column_id, position);
            """
        )
        user = connection.execute("SELECT id FROM users WHERE username = ?", ("user",)).fetchone()
        if user is None:
            now = utc_now()
            user_id = str(uuid4())
            board_id = str(uuid4())
            connection.execute(
                "INSERT INTO users (id, username, password_hash, created_at) VALUES (?, ?, ?, ?)",
                (user_id, "user", "mvp-placeholder", now),
            )
            connection.execute(
                "INSERT INTO boards (id, user_id, name, created_at, updated_at) VALUES (?, ?, ?, ?, ?)",
                (board_id, user_id, "Project Board", now, now),
            )
            connection.executemany(
                "INSERT INTO columns (id, board_id, title, position, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)",
                [(column_id, board_id, title, position, now, now) for column_id, title, position in INITIAL_COLUMNS],
            )
            connection.executemany(
                INSERT_CARD,
                [
                    (card_id, board_id, column_id, title, details, position, now, now)
                    for card_id, title, details, column_id, position in INITIAL_CARDS
                ],
            )


def get_board(connection: sqlite3.Connection) -> dict[str, Any]:
    board = connection.execute("SELECT id, name FROM boards ORDER BY created_at LIMIT 1").fetchone()
    if board is None:
        raise LookupError("No board exists")
    columns = connection.execute(
        "SELECT id, title FROM columns WHERE board_id = ? ORDER BY position",
        (board["id"],),
    ).fetchall()
    cards = connection.execute(
        "SELECT id, title, details, column_id FROM cards WHERE board_id = ? ORDER BY position",
        (board["id"],),
    ).fetchall()

    cards_by_column = {column["id"]: [] for column in columns}
    card_map = {}
    for card in cards:
        card_map[card["id"]] = {
            "id": card["id"],
            "title": card["title"],
            "details": card["details"],
        }
        cards_by_column[card["column_id"]].append(card["id"])

    return {
        "id": board["id"],
        "name": board["name"],
        "columns": [
            {"id": column["id"], "title": column["title"], "cardIds": cards_by_column[column["id"]]}
            for column in columns
        ],
        "cards": card_map,
    }


def rename_column(connection: sqlite3.Connection, column_id: str, title: str) -> None:
    result = connection.execute(
        "UPDATE columns SET title = ?, updated_at = ? WHERE id = ?",
        (title, utc_now(), column_id),
    )
    if result.rowcount == 0:
        raise LookupError("Column not found")


def create_card(connection: sqlite3.Connection, column_id: str, title: str, details: str) -> str:
    card_id = f"card-{uuid4().hex[:12]}"
    now = utc_now()
    column = connection.execute("SELECT board_id FROM columns WHERE id = ?", (column_id,)).fetchone()
    if column is None:
        raise LookupError("Column not found")
    position = connection.execute(
        "SELECT COALESCE(MAX(position) + 1, 0) FROM cards WHERE column_id = ?",
        (column_id,),
    ).fetchone()[0]
    connection.execute(
        INSERT_CARD,
        (card_id, column["board_id"], column_id, title, details, position, now, now),
    )
    return card_id


def update_card(
    connection: sqlite3.Connection,
    card_id: str,
    title: str | None = None,
    details: str | None = None,
    column_id: str | None = None,
    position: int | None = None,
) -> None:
    card = connection.execute(
        "SELECT board_id, column_id, title, details FROM cards WHERE id = ?",
        (card_id,),
    ).fetchone()
    if card is None:
        raise LookupError("Card not found")
    target_column_id = column_id or card["column_id"]
    target_column = connection.execute("SELECT board_id FROM columns WHERE id = ?", (target_column_id,)).fetchone()
    if target_column is None or target_column["board_id"] != card["board_id"]:
        raise LookupError("Target column not found")
    next_title = title if title is not None else card["title"]
    next_details = details if details is not None else card["details"]
    connection.execute(
        "UPDATE cards SET title = ?, details = ?, updated_at = ? WHERE id = ?",
        (next_title, next_details, utc_now(), card_id),
    )
    if target_column_id == card["column_id"] and position is None:
        return

    ordered_ids = [
        row["id"]
        for row in connection.execute(
            "SELECT id FROM cards WHERE column_id = ? AND id != ? ORDER BY position",
            (target_column_id, card_id),
        )
    ]
    ordered_ids.insert(len(ordered_ids) if position is None else min(position, len(ordered_ids)), card_id)
    # Two passes (temporary negative positions first) so no step violates UNIQUE(column_id, position).
    connection.executemany(
        "UPDATE cards SET column_id = ?, position = ? WHERE id = ?",
        [(target_column_id, -index - 1, ordered_id) for index, ordered_id in enumerate(ordered_ids)],
    )
    connection.executemany(
        "UPDATE cards SET position = ? WHERE id = ?",
        [(index, ordered_id) for index, ordered_id in enumerate(ordered_ids)],
    )
    if target_column_id != card["column_id"]:
        normalize_positions(connection, card["column_id"])


def delete_card(connection: sqlite3.Connection, card_id: str) -> None:
    card = connection.execute("SELECT column_id FROM cards WHERE id = ?", (card_id,)).fetchone()
    if card is None:
        raise LookupError("Card not found")
    connection.execute("DELETE FROM cards WHERE id = ?", (card_id,))
    normalize_positions(connection, card["column_id"])


def normalize_positions(connection: sqlite3.Connection, column_id: str) -> None:
    # Renumber in ascending order; each card only moves down into a free slot, so no UNIQUE clash.
    cards = connection.execute(
        "SELECT id FROM cards WHERE column_id = ? ORDER BY position, id", (column_id,)
    ).fetchall()
    for position, card in enumerate(cards):
        connection.execute("UPDATE cards SET position = ? WHERE id = ?", (position, card["id"]))
