from pathlib import Path

from .auth import hash_password
from .boards import INSERT_CARD
from .database import connect, migrate, utc_now

DEMO_USERNAME = "user"
DEMO_PASSWORD = "password"
LEGACY_PASSWORD_HASH = "mvp-placeholder"

DEMO_COLUMNS = [
    ("col-backlog", "Backlog"),
    ("col-discovery", "Discovery"),
    ("col-progress", "In Progress"),
    ("col-review", "Review"),
    ("col-done", "Done"),
]

# (id, title, details, column, priority)
DEMO_CARDS = [
    (
        "card-1",
        "Align roadmap themes",
        "Draft quarterly themes with impact statements and metrics.",
        "col-backlog",
        "high",
    ),
    (
        "card-2",
        "Gather customer signals",
        "Review support tags, sales notes, and churn feedback.",
        "col-backlog",
        "none",
    ),
    (
        "card-3",
        "Prototype analytics view",
        "Sketch initial dashboard layout and key drill-downs.",
        "col-discovery",
        "medium",
    ),
    ("card-4", "Refine status language", "Standardize column labels and tone across the board.", "col-progress", "low"),
    ("card-5", "Design card layout", "Add hierarchy and spacing for scanning dense lists.", "col-progress", "none"),
    ("card-6", "QA micro-interactions", "Verify hover, focus, and loading states.", "col-review", "none"),
    ("card-7", "Ship marketing page", "Final copy approved and asset pack delivered.", "col-done", "none"),
    ("card-8", "Close onboarding sprint", "Document release notes and share internally.", "col-done", "none"),
]


def initialize_database(database_path: Path) -> None:
    """Migrate the schema, then make sure the demo account exists with a usable password."""
    migrate(database_path)
    with connect(database_path) as connection:
        user = connection.execute("SELECT id, password_hash FROM users WHERE username = ?", (DEMO_USERNAME,)).fetchone()
        if user is not None:
            if user["password_hash"] == LEGACY_PASSWORD_HASH:
                connection.execute(
                    "UPDATE users SET password_hash = ?, display_name = 'Demo User' WHERE id = ?",
                    (hash_password(DEMO_PASSWORD), user["id"]),
                )
            return

        now = utc_now()
        user_id = "user-demo"
        board_id = "board-demo"
        connection.execute(
            "INSERT INTO users (id, username, display_name, password_hash, created_at) VALUES (?, ?, ?, ?, ?)",
            (user_id, DEMO_USERNAME, "Demo User", hash_password(DEMO_PASSWORD), now),
        )
        connection.execute(
            "INSERT INTO boards (id, user_id, name, description, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)",
            (board_id, user_id, "Project Board", "The demo product launch board.", now, now),
        )
        connection.executemany(
            "INSERT INTO columns (id, board_id, title, position, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)",
            [
                (column_id, board_id, title, position, now, now)
                for position, (column_id, title) in enumerate(DEMO_COLUMNS)
            ],
        )
        positions: dict[str, int] = {}
        rows = []
        for card_id, title, details, column_id, priority in DEMO_CARDS:
            position = positions.get(column_id, 0)
            positions[column_id] = position + 1
            rows.append((card_id, board_id, column_id, title, details, priority, None, position, now, now))
        connection.executemany(INSERT_CARD, rows)
