# Code review

Date: 2026-09-23. Scope: whole repository (backend, frontend, Docker, scripts, tests, docs).

Method: full read of all source, config, and test files, plus targeted probes to confirm the higher-severity findings. Each finding states its evidence: "verified" means reproduced by running code; "by reading" means established from the code but not executed.

Baseline at the time of review: backend 11/11, frontend unit 13/13, Playwright 9/9 plus the live AI test (skips when the free provider is overloaded), and the Docker build, run, and persistence checks all pass.

## Summary

The MVP is small, readable, and close to the plan. The data model, validation of AI output before mutation, and static serving are sound. The most important problems are:

1. The Sign In button and the card Save button are white-on-white, caused by a CSS variable name typo.
2. A multi-operation AI reply can partially apply and still return an error, leaving the UI out of sync with the database.
3. All routes are `async def` but do blocking I/O, so a slow AI call freezes every other request.

## High

### H1. Sign In and card Save buttons are invisible

- Location: `frontend/src/app/page.tsx:112`, `frontend/src/components/KanbanCard.tsx:62`
- Issue: both use `bg-[var(--purple-secondary)]`, but `globals.css` defines `--secondary-purple`. The background is dropped and the white label sits on a white card.
- Evidence (verified): computed style of the Sign In button in Chromium is `background-color: rgba(0, 0, 0, 0)`, `color: rgb(255, 255, 255)`.
- Action: change both to `var(--secondary-purple)`.

### H2. AI board operations are not atomic

- Location: `backend/app/ai.py:135` (`apply_operations`)
- Issue: operations are checked against a single snapshot of the board, then each is applied in its own transaction. If a later operation fails (for example `delete card-1` followed by `update card-1`), the earlier ones are already committed. `/api/chat` returns 502, and `ChatSidebar` only refreshes the board on success, so the UI keeps showing the deleted card.
- Evidence (verified): applying `[delete card-1, update card-1]` raised `LookupError: Card not found`, and afterwards `card-1` was gone from the database.
- Action: apply all operations inside one `connect()` transaction. This means the database helpers need to accept an open connection, or `apply_operations` needs to perform the SQL directly. Add a test for the example above.

### H3. Blocking I/O inside `async def` routes stalls the server

- Location: all 11 routes in `backend/app/main.py` (for example `chat` at line 123, `read_board` at line 134)
- Issue: the routes are `async def` but call blocking `sqlite3` and `urllib.request.urlopen` (up to 60s per socket read). These run on the event loop, so while one chat request waits on OpenRouter, board loads, drags, and edits from the same UI hang.
- Evidence (verified after review): with the AI call replaced by a 3s sleep, a board load sent during a chat took 2.79s on `async def` routes and 0.22s on plain `def` routes.
- Action: change the route functions to plain `def`. No other change is needed.

### H4. Cards cannot be dropped into an empty column (reported after review, fixed)

- Location: `frontend/src/components/KanbanBoard.tsx` (`DndContext` `collisionDetection`)
- Issue: the board used dnd-kit's `closestCorners`, which picks the drop target whose corners are closest to the dragged card's corners and ignores where the pointer is. Grid rows stretch every column to the tallest one, so an empty column is very tall (1044px at 1280x720) and its corners are far from the card. Small cards in neighbouring columns always ranked closer, so the drop resolved to the wrong target.
- Evidence (verified): dragging `card-4` into an emptied Discovery column resolved to `card-4` itself (no move) or to `card-3` in Backlog (`PATCH {"column_id":"col-backlog"}`). `col-discovery` never ranked first, even with the pointer inside it.
- Fix: a collision detector that uses `pointerWithin` first and falls back to `closestCorners`. Over a card, the card is still the smaller target under the pointer, so reordering is unchanged.
- Tests: Playwright `drops a card into an empty column and keeps it after reload` (fails on `closestCorners`, passes with the fix) and `reorders cards within a column and keeps the order after reload` (passes both ways, guarding against regression).

## Medium

### M1. Card edit form shows stale values after a board refresh

- Location: `frontend/src/components/KanbanCard.tsx:15-16`
- Issue: `title` and `details` state is initialised from props once. Cards are keyed by id, so after the AI (or any refresh) changes a card, opening Edit shows the old text, and Save writes it back, reverting the change. Cancel also keeps the unsaved draft.
- Action: reset the draft from `card` when entering edit mode (set both fields in the Edit button's click handler) and on Cancel. Add a component test that changes the card prop and then opens Edit.

### M2. Current chat message is sent to the model twice

- Location: `frontend/src/components/ChatSidebar.tsx:29`, `backend/app/ai.py:93-94`
- Issue: the frontend passes `nextMessages` (which already ends with the new user message) as `history`, and the backend appends `payload.message` again.
- Action: send `messages` (before appending) as the history, or stop appending on the backend. Pick one side and update its test.

### M3. Unknown `/api/*` routes return 200 with HTML

- Location: `backend/app/main.py:188`
- Issue: the catch-all returns the fallback "Hello world" page for unmatched `api/` paths, so typos and removed endpoints look like successful responses.
- Action: raise `HTTPException(404)` for `api/` paths.

### M4. Static-frontend test depends on a prior frontend build

- Location: `backend/tests/test_static_frontend.py`
- Issue: it asserts `"Kanban Studio"` in `/`, which is only true when `frontend/out` exists. On a clean checkout it gets the fallback page and fails. It also creates a module-level `TestClient` without the lifespan context, so the startup hook never runs.
- Action: point `FRONTEND_BUILD_DIR` at a temporary directory containing a minimal `index.html` (with monkeypatch), and use the `client` fixture pattern from `test_board_api.py`.

### M5. Free AI model is unreliable

- Location: `backend/app/ai.py` (`DEFAULT_MODEL`)
- Issue: about half of live calls fail with the provider's "Upstream error from Nvidia: Service temporarily overloaded". The app now reports this clearly, but the feature is unreliable for users.
- Evidence (verified): repeated live calls during testing.
- Action (decision needed): switch `OPENROUTER_MODEL` to a paid or more available model, or add one retry on provider-overload errors. The model is fixed in `AGENTS.md`, so this needs sign-off.

### M6. Dependency management is not reproducible

- Location: `backend/pyproject.toml`, `Dockerfile:6`, `Dockerfile:18-21`
- Issues:
  - There is no `uv.lock`, so installs are not locked. `AGENTS.md` names uv as the package manager, but uv is only used as a pip replacement.
  - `pytest` and `httpx` are runtime dependencies and ship in the production image.
  - `npm install` in the Dockerfile ignores `package-lock.json` drift. `npm ci` is the reproducible form.
  - uv is installed with `pip install uv`. The documented approach is `COPY --from=ghcr.io/astral-sh/uv:latest /uv /usr/local/bin/uv`.
  - Versions are pinned to 2024 releases (`fastapi==0.115.0`, `uvicorn==0.30.6`, `pytest==8.3.3`), against the "use latest versions" standard.
- Action: move `pytest` and `httpx` to `[dependency-groups] dev`, upgrade the pins, generate `uv.lock`, and use `uv sync --frozen --no-dev` in the Dockerfile. Use `npm ci`, and copy the uv binary from the official image.

### M7. OpenRouter timeout is per socket operation, not total

- Location: `backend/app/ai.py:113`
- Issue: `urlopen(timeout=60)` bounds each blocking socket operation, not the whole request, so a slowly streaming response can exceed 60s. The first live chat call during Docker testing took more than 120s before returning 502. This was not reproduced, so the cause is unconfirmed.
- Action: if it recurs, capture timings before changing anything. H3 limits the damage in the meantime.

## Low

### L1. Leftover scaffolding and dead code

- `backend/app/main.py:49-117`: the "Hello world" fallback page and `/api/hello` date from Part 2 and have no user-facing purpose.
- `frontend/src/lib/kanban.ts`: `createId` is unused. `initialData` is only used by tests; it could move into the tests or stay as a test fixture.
- `frontend/src/components/KanbanBoard.tsx:123`: unused `_columnId` parameter, threaded through `KanbanColumn`.
- Action: remove them. If there is no build, return a short plain 503 message or let the catch-all 404.

### L2. Deprecated FastAPI startup hook

- Location: `backend/app/main.py:44`
- Issue: `@app.on_event("startup")` emits a deprecation warning in every test run.
- Action: use a `lifespan` context manager.

### L3. Inconsistent Python formatting and no Python linter

- Location: `backend/app/main.py`, `backend/app/ai.py` use 2-space indentation; `database.py` and the tests use 4-space.
- Action: add `ruff` as a dev dependency and run `ruff format` and `ruff check` once. This settles 4-space (PEP 8).

### L4. Placeholder details are stored as real data

- Location: `frontend/src/components/KanbanBoard.tsx:116`
- Issue: an empty details field is saved as the literal text "No details yet.", which the AI and later edits then treat as content.
- Action: store an empty string. If a placeholder is wanted, render it in the card when details are empty.

### L5. Column rename edge cases

- Location: `frontend/src/components/KanbanBoard.tsx:102`, `frontend/src/components/KanbanColumn.tsx` (`onBlur`)
- Issue: clearing a title shows an empty column name that is never saved and never reverted. Every blur sends a PATCH even when nothing changed.
- Action: on blank input, refresh from the server (or restore the previous title). Skip the request when the title is unchanged.

### L6. Chat history roles are not validated

- Location: `backend/app/ai.py:27`
- Issue: `history: list[dict[str, str]]` lets the client send any role, including `system`, straight to the model. Card text is also placed in a system message. This is low risk for a single-user local MVP, but worth tightening.
- Action: model the history as `list[ChatMessage]` with `role: Literal["user", "assistant"]`.

### L7. Card reordering uses a +100000 offset trick

- Location: `backend/app/database.py:217-242`
- Issue: moves shift positions by +100000 and -99999 to avoid `UNIQUE(column_id, position)` collisions, then normalise. It works, but it is hard to follow.
- Action (optional simplification): read the column's ordered ids, insert the card at the target index in Python, and write the positions back. First park them at negative values, or drop the unique constraint and rely on normalisation.

### L8. Board lookup and auth are not user-scoped (known MVP limitation)

- Location: `backend/app/database.py:121` (`ORDER BY created_at LIMIT 1`), `frontend/src/app/page.tsx` (credentials checked in the browser)
- Issue: the API is open, and every request uses the first board. This is accepted for the MVP and documented in `PLAN.md`, but it is the main blocker for multiple users.
- Action: none for the MVP. Before adding users, add a server-side session and pass `user_id` into every database function.

### L9. Playwright web server depends on an activated venv

- Location: `frontend/playwright.config.ts:27`
- Issue: it runs `python -m uvicorn`, so it only works when the Python on `PATH` has the backend dependencies. The project convention is uv.
- Action: after M6, change to `uv run --project backend uvicorn ...`.

## Documentation

- `docs/schema.json`: `approval.status` is still `"draft"` with `implementationBlockedUntilApproved: true`, although `PLAN.md` records it as approved. Set it to approved.
- `frontend/AGENTS.md`: still describes a "client-side demo", says `page.tsx` renders the board directly, and omits `lib/boardApi.ts`. Update to the current structure.
- `scripts/AGENTS.md`: a one-line placeholder. Either list the scripts and what they do, or remove it.
- `backend/AGENTS.md`: the validation command `uv run --project backend pytest backend/tests` only works after M6 and requires uv to be installed.

## Test coverage gaps

- No test for H2 (partial application of AI operations). Resolved: `test_chat_rolls_back_all_operations_when_one_fails`.
- No test for M1 (edit form after the card prop changes).
- No backend test for reordering within the same column (only cross-column moves are covered).
- No test that an unknown `/api/*` path returns 404 (M3).
- No frontend lint or type check in any documented validation step (`npm run lint` passes; `tsc --noEmit` is not run).

## Action plan

Suggested order: fix the user-visible bugs first, then the correctness and tooling items. Each item is small.

1. [x] H1: fix the CSS variable name in `page.tsx` and `KanbanCard.tsx`.
2. [x] H2: make `apply_operations` a single transaction and add a regression test.
3. [x] H3: change the FastAPI routes from `async def` to `def`.
3a. [x] H4: fix dropping cards into an empty column, with a regression test.
4. [x] M1: reset the card edit draft from props when opening Edit or cancelling, and add a test.
5. [x] M2: stop sending the current message twice (frontend sends only earlier turns as history).
6. [x] M3: return 404 for unknown `/api/*` paths, and add a test.
7. [x] M4: make `test_static_frontend.py` independent of `frontend/out` (temporary build dir; also covers assets, SPA fallback, path traversal, missing build).
8. [ ] M5: decide on the AI model or a retry (needs sign-off, since `AGENTS.md` fixes the model). Open.
9. [x] M6: add `uv.lock` and a dev dependency group, upgrade to current releases (FastAPI 0.141, Starlette 1.7, uvicorn 0.53, pytest 9.1), switch the test client dependency to `httpx2`, use `uv sync --frozen --no-dev`, `npm ci`, and the pinned official uv image. Node 24 and Python 3.14 base images.
10. [x] L1-L3: remove scaffolding and dead code, switch to `lifespan`, add ruff and format the backend.
11. [x] L4-L6: store empty details, restore a cleared column title, restrict chat history roles to `user`/`assistant`. Skipping the PATCH for an unchanged column title was not done; it is harmless.
12. [x] L9: move the Playwright server command to `uv run`.
13. [x] Documentation: update `schema.json`, `backend/AGENTS.md`, `frontend/AGENTS.md`, `scripts/AGENTS.md`, `CLAUDE.md`.
14. [x] L7: reorder simplification (build the order in Python, write positions in two passes), with new backend tests for same-column reorder, empty-column moves, and clamping.
15. [ ] L8: server-side auth and per-user board scoping before multi-user. Future work.
16. [ ] M7: OpenRouter total timeout. Monitor; not reproduced.

Also fixed during this pass: `tsc --noEmit` failed on every test file because `src/test/vitest.d.ts` referenced `vitest` instead of `vitest/globals`. It now passes and is available as `npm run typecheck`.
