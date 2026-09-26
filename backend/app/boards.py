import sqlite3
from typing import Any
from uuid import uuid4

from .database import utc_now

DEFAULT_COLUMNS = ["Backlog", "Discovery", "In Progress", "Review", "Done"]

CARD_FIELDS = ("title", "details", "priority", "due_date")

INSERT_CARD = (
    "INSERT INTO cards (id, board_id, column_id, title, details, priority, due_date, position, created_at, updated_at) "
    "VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)"
)


def new_id(prefix: str) -> str:
    return f"{prefix}-{uuid4().hex[:12]}"


def list_boards(connection: sqlite3.Connection, user_id: str) -> list[dict[str, Any]]:
    rows = connection.execute(
        "SELECT b.id, b.name, b.description, b.created_at, b.updated_at, COUNT(c.id) AS card_count "
        "FROM boards b LEFT JOIN cards c ON c.board_id = b.id "
        "WHERE b.user_id = ? GROUP BY b.id ORDER BY b.created_at, b.id",
        (user_id,),
    ).fetchall()
    return [dict(row) for row in rows]


def create_board(
    connection: sqlite3.Connection,
    user_id: str,
    name: str,
    description: str = "",
    column_titles: list[str] = DEFAULT_COLUMNS,
) -> str:
    board_id = new_id("board")
    now = utc_now()
    connection.execute(
        "INSERT INTO boards (id, user_id, name, description, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)",
        (board_id, user_id, name, description, now, now),
    )
    connection.executemany(
        "INSERT INTO columns (id, board_id, title, position, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)",
        [(new_id("col"), board_id, title, position, now, now) for position, title in enumerate(column_titles)],
    )
    return board_id


def require_board(connection: sqlite3.Connection, board_id: str, user_id: str) -> None:
    """Raise LookupError unless the board exists and belongs to the user, so other users' boards look missing."""
    row = connection.execute("SELECT 1 FROM boards WHERE id = ? AND user_id = ?", (board_id, user_id)).fetchone()
    if row is None:
        raise LookupError("Board not found")


def get_board(connection: sqlite3.Connection, board_id: str) -> dict[str, Any]:
    board = connection.execute("SELECT id, name, description FROM boards WHERE id = ?", (board_id,)).fetchone()
    if board is None:
        raise LookupError("Board not found")
    columns = connection.execute(
        "SELECT id, title FROM columns WHERE board_id = ? ORDER BY position",
        (board_id,),
    ).fetchall()
    cards = connection.execute(
        "SELECT id, column_id, title, details, priority, due_date FROM cards WHERE board_id = ? ORDER BY position",
        (board_id,),
    ).fetchall()

    cards_by_column = {column["id"]: [] for column in columns}
    card_map = {}
    for card in cards:
        card_map[card["id"]] = {field: card[field] for field in ("id", *CARD_FIELDS)}
        cards_by_column[card["column_id"]].append(card["id"])

    return {
        **dict(board),
        "columns": [
            {"id": column["id"], "title": column["title"], "cardIds": cards_by_column[column["id"]]}
            for column in columns
        ],
        "cards": card_map,
    }


def touch_board(connection: sqlite3.Connection, board_id: str) -> None:
    connection.execute("UPDATE boards SET updated_at = ? WHERE id = ?", (utc_now(), board_id))


def update_board(connection: sqlite3.Connection, board_id: str, changes: dict[str, str]) -> None:
    for field in ("name", "description"):
        if field in changes:
            connection.execute(f"UPDATE boards SET {field} = ? WHERE id = ?", (changes[field], board_id))
    touch_board(connection, board_id)


def delete_board(connection: sqlite3.Connection, board_id: str) -> None:
    connection.execute("DELETE FROM boards WHERE id = ?", (board_id,))


def _write_positions(connection: sqlite3.Connection, table: str, ordered_ids: list[str]) -> None:
    # Two passes (temporary negative positions first) so no step violates the UNIQUE position constraint.
    connection.executemany(
        f"UPDATE {table} SET position = ? WHERE id = ?",
        [(-index - 1, row_id) for index, row_id in enumerate(ordered_ids)],
    )
    connection.executemany(
        f"UPDATE {table} SET position = ? WHERE id = ?",
        [(index, row_id) for index, row_id in enumerate(ordered_ids)],
    )


def _column_ids(connection: sqlite3.Connection, board_id: str) -> list[str]:
    rows = connection.execute("SELECT id FROM columns WHERE board_id = ? ORDER BY position", (board_id,))
    return [row["id"] for row in rows]


def _card_ids(connection: sqlite3.Connection, column_id: str) -> list[str]:
    rows = connection.execute("SELECT id FROM cards WHERE column_id = ? ORDER BY position", (column_id,))
    return [row["id"] for row in rows]


def create_column(connection: sqlite3.Connection, board_id: str, title: str) -> str:
    column_id = new_id("col")
    now = utc_now()
    connection.execute(
        "INSERT INTO columns (id, board_id, title, position, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)",
        (column_id, board_id, title, len(_column_ids(connection, board_id)), now, now),
    )
    touch_board(connection, board_id)
    return column_id


def update_column(
    connection: sqlite3.Connection,
    board_id: str,
    column_id: str,
    title: str | None = None,
    position: int | None = None,
) -> None:
    ordered_ids = _column_ids(connection, board_id)
    if column_id not in ordered_ids:
        raise LookupError("Column not found")
    if title is not None:
        connection.execute("UPDATE columns SET title = ?, updated_at = ? WHERE id = ?", (title, utc_now(), column_id))
    if position is not None:
        ordered_ids.remove(column_id)
        ordered_ids.insert(min(position, len(ordered_ids)), column_id)
        _write_positions(connection, "columns", ordered_ids)
    touch_board(connection, board_id)


def delete_column(connection: sqlite3.Connection, board_id: str, column_id: str) -> None:
    """Delete a column and, through the foreign key cascade, its cards."""
    result = connection.execute("DELETE FROM columns WHERE id = ? AND board_id = ?", (column_id, board_id))
    if result.rowcount == 0:
        raise LookupError("Column not found")
    _write_positions(connection, "columns", _column_ids(connection, board_id))
    touch_board(connection, board_id)


def create_card(
    connection: sqlite3.Connection,
    board_id: str,
    column_id: str,
    title: str,
    details: str = "",
    priority: str = "none",
    due_date: str | None = None,
) -> str:
    column = connection.execute("SELECT 1 FROM columns WHERE id = ? AND board_id = ?", (column_id, board_id)).fetchone()
    if column is None:
        raise LookupError("Column not found")
    card_id = new_id("card")
    now = utc_now()
    position = len(_card_ids(connection, column_id))
    connection.execute(
        INSERT_CARD,
        (card_id, board_id, column_id, title, details, priority, due_date, position, now, now),
    )
    touch_board(connection, board_id)
    return card_id


def update_card(connection: sqlite3.Connection, board_id: str, card_id: str, changes: dict[str, Any]) -> None:
    """Apply field changes and an optional move (column_id and/or position) to a card on the board."""
    card = connection.execute(
        "SELECT column_id FROM cards WHERE id = ? AND board_id = ?", (card_id, board_id)
    ).fetchone()
    if card is None:
        raise LookupError("Card not found")
    for field in CARD_FIELDS:
        if field in changes:
            connection.execute(f"UPDATE cards SET {field} = ? WHERE id = ?", (changes[field], card_id))
    connection.execute("UPDATE cards SET updated_at = ? WHERE id = ?", (utc_now(), card_id))

    source_column_id = card["column_id"]
    target_column_id = changes.get("column_id") or source_column_id
    position = changes.get("position")
    if target_column_id != source_column_id or position is not None:
        if target_column_id not in _column_ids(connection, board_id):
            raise LookupError("Target column not found")
        ordered_ids = [row_id for row_id in _card_ids(connection, target_column_id) if row_id != card_id]
        ordered_ids.insert(len(ordered_ids) if position is None else min(position, len(ordered_ids)), card_id)
        connection.execute(
            "UPDATE cards SET column_id = ?, position = ? WHERE id = ?", (target_column_id, -1_000_000, card_id)
        )
        _write_positions(connection, "cards", ordered_ids)
        if target_column_id != source_column_id:
            _write_positions(connection, "cards", _card_ids(connection, source_column_id))
    touch_board(connection, board_id)


def delete_card(connection: sqlite3.Connection, board_id: str, card_id: str) -> None:
    card = connection.execute(
        "SELECT column_id FROM cards WHERE id = ? AND board_id = ?", (card_id, board_id)
    ).fetchone()
    if card is None:
        raise LookupError("Card not found")
    connection.execute("DELETE FROM cards WHERE id = ?", (card_id,))
    _write_positions(connection, "cards", _card_ids(connection, card["column_id"]))
    touch_board(connection, board_id)
