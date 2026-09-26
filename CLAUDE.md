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
- `npm run test:e2e` - Playwright against the real stack: builds the static export, then starts the backend with `uv run --project backend uvicorn` on port 8001 with a fresh temp SQLite DB. Loads root `.env`; the live OpenRouter test is skipped without `OPENROUTER_API_KEY` or when the free provider fails or is overloaded. First run needs `npx playwright install chromium`.
- `npm run lint`, `npm run typecheck`

## Architecture

Single container: a multi-stage `Dockerfile` builds the Next.js static export, then a Python 3.12 image runs uvicorn with `backend.app.main:app`. FastAPI serves JSON under `/api/*` and the static export for every other path (catch-all route at the bottom of `main.py`, falling back to `index.html`). Frontend code calls relative `/api/...` URLs, so it only talks to a backend when served by FastAPI.

Backend (`backend/app`):
- `main.py` - app assembly, `lifespan` startup (`seed.initialize_database`), a `LookupError` -> 404 handler, and board routes: `GET/POST /api/boards`, `GET/PATCH/DELETE /api/boards/{id}`, `POST /api/boards/{id}/columns`, `PATCH/DELETE .../columns/{cid}`, `POST .../cards`, `PATCH/DELETE .../cards/{cid}`, `POST .../chat`. Every board route takes `CurrentUser` and calls `boards.require_board` (other users' boards 404). Routes are plain `def` and open one connection per request via `_connect()`. DB path lives on `app.state.database_path` (env `PM_DATABASE_PATH`, default `data/app.db`, mounted as a volume in compose). `GET /api/health` is Playwright's readiness check.
- `auth.py` - `/api/auth` routes (`register`, `login`, `logout`, `GET/PATCH/DELETE me`, `password`), scrypt password hashes, and sessions in the HttpOnly `pm_session` cookie (SHA-256 of the token stored in `sessions`). `CurrentUser` is the auth dependency.
- `boards.py` - board/column/card functions taking an open `sqlite3.Connection` and a `board_id` (the caller owns the transaction; `connect()` commits or rolls back). Moves rebuild the order in Python and write positions in two passes to respect the UNIQUE position constraints.
- `database.py` - `connect()`, the latest `SCHEMA`, and `MIGRATIONS` keyed by `PRAGMA user_version` (version 1 is the original MVP schema). `seed.py` migrates and seeds the demo account `user`/`password` with fixed ids (`board-demo`, `col-backlog`, `card-1`...).
- `ai.py` - calls OpenRouter via `urllib` (no SDK) with the current board and chat history; the request uses strict `json_schema` output (`RESPONSE_SCHEMA`: `{message, operations[]}`, operations are `create|update|move|delete` with unused fields `null`). OpenRouter can return HTTP 200 with an `error` body or `finish_reason: "error"` (the free provider is often overloaded); both become `OpenRouterError` -> HTTP 502. `apply_operations` applies operations in order in one transaction, so any invalid one rolls back all. Env: `OPENROUTER_API_KEY` (from root `.env`), optional `OPENROUTER_MODEL`.

Frontend (`frontend/src`):
- `app/page.tsx` - restores the session via `GET /api/auth/me`, then renders `AuthScreen` or `Workspace` (board list sidebar, account dialog, active `KanbanBoard`).
- `lib/kanban.ts` - board model `{ id, name, description, columns: [{id, title, cardIds}], cards: {id: {id, title, details, priority, due_date}} }`, drag/drop logic, and filters; `lib/api.ts` is the shared request helper, `lib/authApi.ts` / `lib/boardApi.ts` / `lib/chatApi.ts` are the API clients.
- `components/KanbanBoard.tsx` orchestrates `@dnd-kit` drag and drop (custom collision: `pointerWithin`, then `closestCorners`, so empty columns accept drops) and persists changes through `mutate` (then reloads); `ChatSidebar.tsx` posts to the board's chat route and reloads the board when `board_updated` is true.
- Component tests use `test/fakeApi.ts`, an in-memory fake of the backend installed as `fetch`.

Backend tests use FastAPI's `TestClient`; `backend/tests/conftest.py` puts the repo root and `backend/` on `sys.path` and provides signed-in client fixtures (`alice`, `bob`, `demo`). Playwright tests register a fresh user per test. Python is formatted with ruff (4-space, 120 columns).
