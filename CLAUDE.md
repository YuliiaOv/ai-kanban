# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

Read `AGENTS.md` (root) first: it holds the business requirements, tech decisions, color scheme, and coding standards (keep it simple, no over-engineering, no emojis, prove root cause before fixing). `docs/PLAN.md` tracks phase status; `backend/AGENTS.md`, `frontend/AGENTS.md`, and `scripts/AGENTS.md` are per-area guides.

## Commands

Run the full app (Docker, serves on http://localhost:8000):
- `docker compose up --build` (or `scripts/start.sh`, `scripts/start.ps1`, `scripts/start.cmd`; matching `stop.*` scripts)

Backend (from repo root):
- All tests: `uv run --project backend pytest backend/tests`
- Single test: `uv run --project backend pytest backend/tests/test_board_api.py::test_name`
- Lint/format: `uv run --project backend ruff check backend`, `uv run --project backend ruff format backend`
- Local server: `uv run --project backend uvicorn backend.app.main:app --reload` (serves `frontend/out` if built, else 503)
- Dependencies: uv with a committed `backend/uv.lock`; test/lint tools are in the `dev` group (`uv add --dev <pkg>`). The Dockerfile runs `uv sync --frozen --no-dev`.

Frontend (from `frontend/`):
- `npm run build` - static export to `frontend/out` (`output: "export"` in `next.config.ts`)
- `npm run test` - Vitest unit/component tests; single file: `npx vitest run src/components/KanbanBoard.test.tsx`, single test: add `-t "name"`
- `npm run test:e2e` - Playwright against the real stack: builds the static export, then starts the backend with `uv run --project backend uvicorn` on port 8001 with a fresh temp SQLite DB. Loads root `.env`; the live OpenRouter test is skipped without `OPENROUTER_API_KEY` or when the free provider reports it is overloaded. First run needs `npx playwright install chromium`.
- `npm run lint`, `npm run typecheck`

## Architecture

Single container: a multi-stage `Dockerfile` builds the Next.js static export, then a Python 3.12 image runs uvicorn with `backend.app.main:app`. FastAPI serves JSON under `/api/*` and the static export for every other path (catch-all route at the bottom of `main.py`, falling back to `index.html`). Frontend code calls relative `/api/...` URLs, so it only talks to a backend when served by FastAPI.

Backend (`backend/app`):
- `main.py` - routes: `GET /api/health` (Playwright's readiness check), `GET /api/board`, `PATCH /api/board/columns/{id}`, `POST/PATCH/DELETE /api/board/cards[/{id}]`, `POST /api/chat`. Routes are plain `def` (blocking SQLite/HTTP runs in FastAPI's thread pool) and open one connection per request via `_connect()`. DB path lives on `app.state.database_path` (env `PM_DATABASE_PATH`, default `data/app.db`, mounted as a volume in compose). Startup uses a `lifespan` handler.
- `database.py` - stdlib `sqlite3`, schema created on startup (users -> boards (1 per user) -> columns -> cards, ordered by `position`). Seeds the hardcoded `user` with a 5-column board if missing. Board functions take an open `sqlite3.Connection` (the caller owns the transaction; `connect()` commits or rolls back) and operate on that single MVP user's board. Card moves rebuild the column order in Python and write positions in two passes to respect `UNIQUE(column_id, position)`.
- `ai.py` - calls OpenRouter via `urllib` (no SDK) with the current board and chat history; the request uses strict `json_schema` output (`RESPONSE_SCHEMA`: `{message, operations[]}`, operations are `create|update|move|delete` with unused fields `null`). OpenRouter can return HTTP 200 with an `error` body or `finish_reason: "error"` (the free provider is often overloaded); both become `OpenRouterError`. The response is validated with Pydantic before `apply_operations` mutates the DB, all operations in one transaction; invalid output raises `OpenRouterError` -> HTTP 502. Env: `OPENROUTER_API_KEY` (from root `.env`), optional `OPENROUTER_MODEL`.

Frontend (`frontend/src`):
- `app/page.tsx` - client-side-only sign-in gate (hardcoded `user`/`password`); the backend has no auth boundary.
- `lib/kanban.ts` - board model `{ columns: [{id, title, cardIds}], cards: {id: {id, title, details}} }` and drag/drop logic; `lib/boardApi.ts` / `lib/chatApi.ts` are the API clients.
- `components/KanbanBoard.tsx` orchestrates `@dnd-kit` drag and drop (custom collision: `pointerWithin`, then `closestCorners`, so empty columns accept drops) and persists changes; `ChatSidebar.tsx` posts to `/api/chat` and reloads the board when `board_updated` is true.

Backend tests use FastAPI's `TestClient`; `backend/tests/conftest.py` puts the repo root and `backend/` on `sys.path`. Python is formatted with ruff (4-space, 120 columns).
