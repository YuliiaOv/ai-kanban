# Code review

Date: 2026-09-26. Scope: the whole repository at `bab6fa1` plus the working tree (backend, frontend, Docker, scripts, tests, docs). No code was changed as part of this review.

Method: I read every source, config, test, and doc file, then ran short probe scripts against the FastAPI app with `TestClient` to confirm the backend findings. Each finding is marked "verified" (reproduced by running code) or "by reading" (follows from the code but was not executed).

Baseline:
- Backend: `pytest` 21/21 pass; `ruff check` and `ruff format --check` are clean.
- Frontend: Vitest 15/15 pass; `npm run lint` and `npm run typecheck` are clean.
- Not run: Playwright e2e and the Docker build.

## Summary

The codebase is small, readable, and consistent with the plan. The fixes from the previous review (2026-09-23) are all in place: button colors, atomic AI operations, sync routes, empty-column drops, and `/api/*` 404s. No High-severity defects remain. The main remaining issues are:

1. The unauthenticated API, including the paid AI endpoint, is published on every network interface.
2. Some OpenRouter error bodies crash the chat route with a 500 or return a meaningless 502 message.
3. The pinned Next.js version has open advisories and cannot receive patch updates.
4. Selecting text with the mouse in a card's edit form starts a drag.

| ID | Severity | Area | Title |
|----|----------|------|-------|
| M1 | Medium | Docker/Security | Unauthenticated API bound to all interfaces |
| M2 | Medium | Backend | OpenRouter error handling crashes or leaks internal key names |
| M3 | Medium | Dependencies | `next` pinned to 16.1.6 with open advisories |
| M4 | Medium | Frontend | Drag listeners stay active while a card is being edited |
| L1 | Low | Backend | Whitespace-only titles and messages are accepted |
| L2 | Low | Backend | AI operation validation ignores earlier operations in the same batch |
| L3 | Low | Frontend | Chat history is left inconsistent after a failed turn |
| L4 | Low | Frontend | Board refreshes can resolve out of order |
| L5 | Low | Backend | `pydantic` is used directly but not declared |
| L6 | Low | Docker | `.env` is mandatory even though AI is optional |
| L7 | Low | Database | Fixed IDs block the planned multi-user support |
| L8 | Low | Frontend | Cards cannot be moved with the keyboard |
| L9 | Low | Backend | Chat history size is unbounded |
| N1-N6 | Nit | Various | Small cleanups, listed at the end |
| D1-D4 | Docs | Docs | Documentation drift |

---

## Medium

### M1. Unauthenticated API bound to all interfaces

- Location: `docker-compose.yml` (`ports: - "8000:8000"`)
- Issue: the backend has no auth boundary (a documented MVP limitation), but Docker publishes port 8000 on every host interface. Anyone on the same network (for example office Wi-Fi) can read and modify the board. They can also call `POST /api/chat`, which spends the OpenRouter key and can delete every card through AI operations. AGENTS.md says the MVP "will run locally", so LAN exposure is not intended.
- Evidence (by reading): Compose's short `"8000:8000"` syntax binds to `0.0.0.0`.
- Action: change the mapping to `"127.0.0.1:8000:8000"`. This is a one-line change and nothing else is affected.

### M2. OpenRouter error handling crashes or leaks internal key names

- Location: `backend/app/ai.py:121-122`, `backend/app/main.py:69`
- Issue:
  - `response_body['error']['message']` runs outside the `try` block. It assumes `error` is an object with a `message` key.
  - If `error` is a string, the resulting `TypeError` is not caught, so the route returns HTTP 500.
  - If `message` is missing, the `KeyError` is caught by `except (LookupError, OpenRouterError)` in `chat`, because `KeyError` is a subclass of `LookupError`. The user then sees the detail `'message'`.
  - Catching `LookupError` that broadly also turns any future programming error (a bad dict key) into a 502 instead of a visible failure.
- Evidence (verified):
  - `{"error": "Rate limited"}` gives `500 Internal Server Error`.
  - `{"error": {"code": 429}}` gives `502 {"detail":"'message'"}`.
- Action:
  - In `ai.py`, move the error check inside the existing `try` block, or read the message defensively: `error = response_body["error"]; message = error.get("message") if isinstance(error, dict) else error`.
  - In `apply_operations`, convert DB `LookupError` into `OpenRouterError` (see L2). `chat` can then catch only `OpenRouterError`.
  - Add backend tests for both body shapes.

### M3. `next` pinned to 16.1.6 with open advisories

- Location: `frontend/package.json` (`"next": "16.1.6"`, `"eslint-config-next": "16.1.6"`)
- Issue: `npm audit --omit=dev` reports one critical `next` advisory group, covering versions up to 16.3.2, plus a high `nanoid` and a moderate `baseline-browser-mapping`. Most `next` advisories concern the Next server (middleware, server actions, image cache, RSC). This app ships a static export served by FastAPI, so their runtime impact is small. The exact pin still blocks every patch release, and the build toolchain is affected. `npm outdated` shows 16.3.6 is current.
- Evidence (verified): output of `npm audit --omit=dev` and `npm outdated`.
- Action: bump `next` and `eslint-config-next` to `16.3.6` and run `npm audit fix` for the transitive packages. Then rerun `npm run build`, the unit tests, and the e2e tests. Also consider patch and minor updates (`@playwright/test` 1.63, `tailwindcss` 4.3, `uvicorn` 0.54, `ruff` 0.16.9). Major upgrades (`vitest` 5, `eslint` 10, `typescript` 7, `jsdom` 30) should be a separate, deliberate change.

### M4. Drag listeners stay active while a card is being edited

- Location: `frontend/src/components/KanbanCard.tsx:101-119`
- Issue: `{...attributes}` and `{...listeners}` are spread on the `<article>` whether or not the card is in edit mode. `PointerSensor` activates after 6px of pointer movement from any descendant. So when a user drags the mouse inside the title input or details textarea to select text, the card starts dragging and the drop may persist a move. The spread `attributes` also give the whole article `role="button"` and `tabIndex=0`, so the form's inputs and buttons end up nested inside a "button", which is invalid for assistive technology.
- Evidence (by reading): the dnd-kit `PointerSensor` listens for `pointerdown` on the node that receives `listeners`, and events from child inputs bubble up to it.
- Action: pass `disabled: isEditing` to `useSortable({ id: card.id, disabled: isEditing })`. That is the smallest fix. Optionally add a Playwright test that selects text in the edit input and asserts the card does not move.

---

## Low

### L1. Whitespace-only titles and messages are accepted

- Location: `backend/app/main.py:35,40,45`, `backend/app/ai.py:20,31`
- Issue: `Field(min_length=1)` accepts `"   "`. The UI trims input before sending, but the API and the AI path (`BoardOperation.title`) do not, so blank cards and blank column titles can be stored. `ChatRequest.message` has the same gap.
- Evidence (verified): `POST /api/board/cards` with title `"   "` returns 201. `PATCH /api/board/columns/col-backlog` with `"   "` returns 200 and stores `'   '`.
- Action: use a shared constrained type, for example `NonBlank = Annotated[str, StringConstraints(strip_whitespace=True, min_length=1)]`, for the title fields and the chat message.

### L2. AI operation validation ignores earlier operations in the same batch

- Location: `backend/app/ai.py:136-171`
- Issue: validation checks each operation against the board snapshot taken before any operation runs. A batch that deletes a card and then updates or deletes it again passes validation, then fails during application with a DB `LookupError`. The transaction rolls back correctly, but the user sees the raw message "Card not found". The error surfaces only because of the broad `LookupError` catch described in M2.
- Evidence (verified): two `delete` operations on `card-2` return `502 {"detail": "Card not found"}`, and the board is unchanged.
- Action: while validating, remove deleted IDs from `card_ids` so later references fail validation with the normal "invalid card operation" message. Alternatively, wrap the apply loop in `except LookupError as e: raise OpenRouterError(...) from e`.

### L3. Chat history is left inconsistent after a failed turn

- Location: `frontend/src/components/ChatSidebar.tsx:435-451`
- Issue:
  - If `/api/chat` fails, the user's message stays in `messages` with no assistant reply, so the next request sends two consecutive `user` turns.
  - If the AI call succeeds but `onBoardUpdated()` rejects, the catch block shows the board-fetch error (`Request failed with status ...`) as a chat error, after the assistant already confirmed the change.
  - The static greeting is also sent to the model as an assistant turn on every request.
- Evidence (by reading).
- Action: on failure, either drop the failed user message or keep it and accept the double turn (document the choice). Handle `onBoardUpdated` failures separately. KanbanBoard already has an error banner that could show them. Exclude the greeting from the history that is sent (`messages.slice(1)`).

### L4. Board refreshes can resolve out of order

- Location: `frontend/src/components/KanbanBoard.tsx:225-263`
- Issue: every mutation awaits `updateCard` and then `refreshBoard()`. Two quick drags can therefore produce two refreshes that resolve in either order. An older snapshot can then briefly overwrite the optimistic state of the newer drag until the next refresh. A chat-triggered refresh can race with a drag in the same way.
- Evidence (by reading).
- Action: keep it simple. Track a request counter in a ref and ignore a refresh whose counter is not the latest. Only do this if it shows up in practice.

### L5. `pydantic` is used directly but not declared

- Location: `backend/pyproject.toml`, `backend/app/ai.py:8`, `backend/app/main.py:7`
- Issue: both modules import `pydantic`, but it is installed only as a transitive dependency of FastAPI.
- Action: `uv add --project backend pydantic`.

### L6. `.env` is mandatory even though AI is optional

- Location: `docker-compose.yml` (`env_file: - .env`)
- Issue: on a fresh clone without `.env`, `docker compose up` fails with "env file not found". The board works without an API key; only chat returns a clear 502.
- Action: use the long syntax: `env_file: [{ path: .env, required: false }]` (Compose 2.24+).

### L7. Fixed IDs block the planned multi-user support

- Location: `backend/app/database.py:151-168,241-268`
- Issue: AGENTS.md requires the database to "support multiple users for future". However, the seeded column IDs (`col-backlog`) and card IDs (`card-1`) are global primary keys, so seeding a board for a second user would violate the `PRIMARY KEY` constraints. `get_board` also returns the oldest board in the table, regardless of user.
- Evidence (by reading).
- Action: no change is needed for the MVP. When a second user is added, generate per-board IDs (as `create_card` already does) and scope `get_board` and the mutations by `board_id`. Record this in `docs/schema.json` so it is not forgotten.

### L8. Cards cannot be moved with the keyboard

- Location: `frontend/src/components/KanbanBoard.tsx:208-212`
- Issue: only `PointerSensor` is registered, so keyboard users cannot move cards. The requirements call drag and drop a core feature.
- Action: add `useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })`. Do this after M4, so that pressing Space inside the edit form does not pick the card up.

### L9. Chat history size is unbounded

- Location: `frontend/src/components/ChatSidebar.tsx:442`, `backend/app/ai.py:30-32`
- Issue: every request sends the full history plus the full board JSON. Long sessions will grow toward the model's context limit and slow the free provider.
- Action: send only the last N turns (for example 20) from the frontend. One line; no backend change needed.

---

## Nits

- N1. `HEAD /` returns 405, because the catch-all is GET-only (verified). This only matters for tools that probe with HEAD. It can be fixed with `@app.api_route("/{path:path}", methods=["GET", "HEAD"])`.
- N2. `handleRenameColumnCommit` sends a PATCH on every blur, even when the title did not change (`KanbanBoard.tsx:278`). Compare against the loaded title first.
- N3. `KanbanCardPreview` renders an empty `<p>` when `details` is empty. `KanbanCard` already guards against this.
- N4. `boards.updated_at` is never updated, but `docs/schema.json` says it is "updated after board mutations". Either update it or change the doc.
- N5. The Docker image runs as root and has no `HEALTHCHECK`. This is acceptable for a local MVP. If desired, add `USER` and `HEALTHCHECK CMD` lines against `/api/health`.
- N6. `@types/node` is `^20`, but the Docker build uses Node 24. Align it to `^24`.

## Documentation drift

- D1. `CLAUDE.md` says "a Python 3.12 image runs uvicorn". The Dockerfile uses `python:3.14-slim`.
- D2. The working tree deletes `docs/code_review.md` and has an uncommitted edit to `CLAUDE.md`. Decide whether this `review.md` replaces the old report and commit accordingly.
- D3. `docs/schema.json` has the `updated_at` mismatch from N4 and lacks the multi-user note from L7.
- D4. `docs/PLAN.md` says all suites pass. Once the items above are fixed, record the date and the counts (backend 21, unit 15) so the claim can be checked.

## Test coverage gaps

- Backend:
  - OpenRouter error bodies where `error` is a string or has no `message` (M2).
  - Whitespace titles (L1).
  - Duplicate or dependent operations in one AI batch (L2).
  - HTTP-level failures from `urlopen` (`HTTPError`, timeout). They are handled but untested.
- Frontend unit tests:
  - `handleDragEnd` failure path (revert and error banner).
  - `ChatSidebar` error path and `onBoardUpdated` rejection (L3).
- E2E:
  - Text selection inside the card edit form must not move the card (M4).
- CI: there is no CI. Running the four fast commands on push would catch regressions cheaply: `pytest`, `ruff check`, `npm run test`, `npm run typecheck`/`lint`.

## What is working well

- Routes are small, use plain `def` for blocking I/O, and use one connection per request with commit-or-rollback in `connect()`.
- AI output is schema-constrained, validated with Pydantic, checked against the board, and applied in one transaction. The rollback is tested.
- Card reordering avoids `UNIQUE(column_id, position)` conflicts with a clear two-pass write, and there are tests for reorder, cross-column moves, and clamping.
- Static serving resolves paths, rejects traversal, and returns 404 for unknown `/api/*` paths. All of this is tested.
- Cross-site simple requests are rejected: a POST with `text/plain` or no content type returns 422 (verified on FastAPI 0.141.1). This limits CSRF against the unauthenticated API, apart from the LAN exposure in M1.
- The frontend is straightforward. Each mutation re-syncs from the backend, the edit form reloads current values, and the collision detection for empty columns is documented and covered by e2e tests.

## Recommended order of work

1. M1 (one line), M2, and L2 together with their tests.
2. M4 (one line), then L8.
3. M3 dependency bump, then rerun all suites, including e2e and the Docker build.
4. L1, L5, L6, and the doc fixes (D1-D4).
5. Remaining Low items and nits as time allows.
