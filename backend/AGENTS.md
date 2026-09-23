# Backend project guide

The backend is a FastAPI application in `backend/app` that serves the static Next.js export and JSON routes under `/api`.

## Current structure

- `app/main.py`: FastAPI app, request models, static frontend serving, board routes, and chat route.
- `app/database.py`: SQLite initialization, seeded MVP board, board reads, and card/column mutations.
- `app/ai.py`: OpenRouter request handling, structured response parsing, and validated board operation application.
- `tests/`: API and static-serving tests.

## Runtime conventions

- Use Python's standard-library `sqlite3` module for persistence.
- The MVP uses one fixed board scope and client-side-only sign-in. Backend routes are not an authentication boundary yet.
- `PM_DATABASE_PATH` selects the SQLite file.
- `OPENROUTER_API_KEY` configures AI access. `OPENROUTER_MODEL` may override the default model.
- The chat endpoint is `POST /api/chat` and returns a user-facing message plus optional explicit board operations.

## Validation commands

From the repository root:

- `uv run --project backend pytest backend/tests`
- `docker compose up --build`

Keep backend changes small and test API behavior through FastAPI's test client. Malformed AI responses must be rejected before board mutations are applied.