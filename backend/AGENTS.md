# Backend project guide

The backend is a FastAPI application in `backend/app` that serves the static Next.js export and JSON routes under `/api`.

## Current structure

- `app/main.py`: FastAPI app, request models, board and chat routes, and static frontend serving (unknown `/api/*` paths return 404).
- `app/database.py`: SQLite initialization, seeded MVP board, and board reads and mutations. Board functions take an open `sqlite3.Connection`, so callers control the transaction.
- `app/ai.py`: OpenRouter request with strict `json_schema` output, provider-error handling, and validated board operation application.
- `tests/`: API, AI parser, and static-serving tests.

## Runtime conventions

- Use Python's standard-library `sqlite3` module for persistence. Open one connection per request with `connect()`; it commits on success and rolls back on any exception.
- Routes are plain `def` (not `async def`) because they do blocking SQLite and HTTP calls; FastAPI runs them in a thread pool.
- AI operations are applied in a single transaction, so a failing operation leaves the board unchanged.
- The MVP uses one fixed board scope and client-side-only sign-in. Backend routes are not an authentication boundary yet.
- `PM_DATABASE_PATH` selects the SQLite file.
- `OPENROUTER_API_KEY` configures AI access. `OPENROUTER_MODEL` may override the default model.
- The chat endpoint is `POST /api/chat`. It takes the current `message` plus earlier `history` turns (roles `user` or `assistant` only) and returns a user-facing message plus optional board operations.

## Dependencies

Managed with uv. Runtime dependencies are in `[project]`, and test and lint tools are in the `dev` dependency group. `uv.lock` is committed, and the Docker image installs it with `uv sync --frozen --no-dev`.

## Validation commands

From the repository root:

- `uv run --project backend pytest backend/tests`
- `uv run --project backend ruff check backend` and `uv run --project backend ruff format backend`
- `docker compose up --build`

Keep backend changes small and test API behavior through FastAPI's test client. Malformed AI responses must be rejected before board mutations are applied.
