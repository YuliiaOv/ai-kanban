# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

Read `AGENTS.md` (root) first: it holds the business requirements, tech decisions, color scheme, and coding standards (keep it simple, no over-engineering, no emojis, prove root cause before fixing). `docs/PLAN.md` tracks phase status; `backend/AGENTS.md` and `frontend/AGENTS.md` are per-area guides.

## Commands

Run the full app (Docker, serves on http://localhost:8000):
- `docker compose up --build` (or `scripts/start.sh`, `scripts/start.ps1`, `scripts/start.cmd`; matching `stop.*` scripts)

Backend (from repo root):
- All tests: `uv run --project backend pytest backend/tests`
- Single test: `uv run --project backend pytest backend/tests/test_board_api.py::test_name`
- Local server: `uv run --project backend uvicorn backend.app.main:app --reload` (serves `frontend/out` if it has been built)

Frontend (from `frontend/`):
- `npm run build` - static export to `frontend/out` (`output: "export"` in `next.config.ts`)
- `npm run test` - Vitest unit/component tests; single file: `npx vitest run src/components/KanbanBoard.test.tsx`, single test: add `-t "name"`
- `npm run test:e2e` - Playwright against the real stack: builds the static export, then runs `python -m uvicorn` (needs the root `.venv` active) on port 8001 with a fresh temp SQLite DB. Loads root `.env`; the live OpenRouter test is skipped without `OPENROUTER_API_KEY`. First run needs `npx playwright install chromium`.
- `npm run lint`

## Architecture

Single container: a multi-stage `Dockerfile` builds the Next.js static export, then a Python 3.12 image runs uvicorn with `backend.app.main:app`. FastAPI serves JSON under `/api/*` and the static export for every other path (catch-all route at the bottom of `main.py`, falling back to `index.html`). Frontend code calls relative `/api/...` URLs, so it only talks to a backend when served by FastAPI.

Backend (`backend/app`):
- `main.py` - routes: `GET /api/board`, `PATCH /api/board/columns/{id}`, `POST/PATCH/DELETE /api/board/cards[/{id}]`, `POST /api/chat`. DB path lives on `app.state.database_path` (env `PM_DATABASE_PATH`, default `data/app.db`, mounted as a volume in compose).
- `database.py` - stdlib `sqlite3`, schema created on startup (users -> boards (1 per user) -> columns -> cards, ordered by `position`). Seeds the hardcoded `user` with a 5-column board if missing. All board functions operate on that single MVP user's board.
- `ai.py` - calls OpenRouter via `urllib` (no SDK) with the current board and chat history; the request uses strict `json_schema` output (`RESPONSE_SCHEMA`: `{message, operations[]}`, operations are `create|update|move|delete` with unused fields `null`). OpenRouter can return HTTP 200 with an `error` body or `finish_reason: "error"` (the free provider is often overloaded); both become `OpenRouterError`. The response is validated with Pydantic before `apply_operations` mutates the DB; invalid output raises `OpenRouterError` -> HTTP 502. Env: `OPENROUTER_API_KEY` (from root `.env`), optional `OPENROUTER_MODEL`.

Frontend (`frontend/src`):
- `app/page.tsx` - client-side-only sign-in gate (hardcoded `user`/`password`); the backend has no auth boundary.
- `lib/kanban.ts` - board model `{ columns: [{id, title, cardIds}], cards: {id: {id, title, details}} }` and drag/drop logic; `lib/boardApi.ts` / `lib/chatApi.ts` are the API clients.
- `components/KanbanBoard.tsx` orchestrates `@dnd-kit` drag and drop and persists changes; `ChatSidebar.tsx` posts to `/api/chat` and reloads the board when `board_updated` is true.

The Dockerfile installs Python deps from `backend/pyproject.toml` (single source of truth). Backend tests use FastAPI's `TestClient`; `backend/tests/conftest.py` puts the repo root and `backend/` on `sys.path`. Python files in `backend/app` mix 2- and 4-space indentation; match the file being edited.
