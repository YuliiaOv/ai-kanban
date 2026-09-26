# Backend project guide

The backend is a FastAPI application in `backend/app` that serves the static Next.js export and JSON routes under `/api`.

## Current structure

- `app/main.py`: FastAPI app, request models, board/column/card/chat routes under `/api/boards`, a `LookupError` -> 404 handler, and static frontend serving (unknown `/api/*` paths return 404).
- `app/auth.py`: users, password hashing (stdlib `hashlib.scrypt`), cookie sessions, the `CurrentUser` dependency, and the `/api/auth` routes.
- `app/boards.py`: board, column, and card reads and mutations. Functions take an open `sqlite3.Connection` and a `board_id`; every lookup is scoped to that board.
- `app/database.py`: `connect()`, the latest `SCHEMA`, and `MIGRATIONS` (tracked with `PRAGMA user_version`).
- `app/seed.py`: `initialize_database()` runs migrations and seeds the demo account `user` / `password` with a board using fixed ids (`board-demo`, `col-backlog`, `card-1`, ...).
- `app/ai.py`: OpenRouter request with strict `json_schema` output, provider-error handling, and board operation application.
- `tests/`: `conftest.py` fixtures (`client`, `alice`, `bob`, `demo`, `make_client`), plus auth, boards API, AI, migration, and static-serving tests.

## Auth

- Sessions are random tokens in the HttpOnly `pm_session` cookie; only their SHA-256 hash is stored (`sessions` table, 30-day expiry).
- Every board route depends on `CurrentUser` (401 without a valid session) and calls `boards.require_board(connection, board_id, user.id)` first. Boards owned by another user return 404, the same as missing ones.
- Usernames are unique case-insensitively (`COLLATE NOCASE`). Changing the password signs out the user's other sessions. Deleting the account cascades to sessions, boards, columns, and cards.

## Runtime conventions

- Use Python's standard-library `sqlite3` module for persistence. Open one connection per request with `connect()`; it commits on success and rolls back on any exception.
- Routes are plain `def` (not `async def`) because they do blocking SQLite and HTTP calls; FastAPI runs them in a thread pool.
- Positions are rewritten in two passes (negative first) to respect `UNIQUE(column_id, position)` and `UNIQUE(board_id, position)`.
- Schema changes: update `SCHEMA` and append a script to `MIGRATIONS`. `test_legacy_database_migrates_to_the_fresh_schema` compares a migrated database with a fresh one.
- AI operations are applied in order in a single transaction, so each sees the earlier ones and any failure leaves the board unchanged.
- `PM_DATABASE_PATH` selects the SQLite file.
- `OPENROUTER_API_KEY` configures AI access. `OPENROUTER_MODEL` may override the default model.
- The chat endpoint is `POST /api/boards/{board_id}/chat`. It takes the current `message` plus earlier `history` turns (roles `user` or `assistant` only) and returns a user-facing message plus optional board operations.

## Dependencies

Managed with uv. Runtime dependencies are in `[project]`, and test and lint tools are in the `dev` dependency group. `uv.lock` is committed, and the Docker image installs it with `uv sync --frozen --no-dev`.

## Validation commands

From the repository root:

- `uv run --project backend pytest backend/tests`
- `uv run --project backend ruff check backend` and `uv run --project backend ruff format backend`
- `docker compose up --build`

Keep backend changes small and test API behavior through FastAPI's test client. Malformed AI responses must be rejected before board mutations are committed.
