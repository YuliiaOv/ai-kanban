# Frontend project guide

This folder contains the Next.js frontend. It is built as a static export (`output: "export"`) and served by the FastAPI backend, which also provides all data under `/api`.

## App structure

- app/page.tsx: entry point. Restores the session with `GET /api/auth/me`, then shows `AuthScreen` or `Workspace`.
- components/AuthScreen.tsx: sign in and create-account forms.
- components/Workspace.tsx: header (account button, log out), the board list sidebar, and the active board. Owns the board list and falls back to the first board when the active one is deleted.
- components/BoardList.tsx: board navigation with card counts and the new-board form.
- components/AccountDialog.tsx: display name, password change, and account deletion.
- components/KanbanBoard.tsx: loads one board, edits its name and description, filters cards, orchestrates drag and drop, and manages columns. Every change goes through `mutate`, which reloads the board afterwards (and the board list when counts or names change).
- components/KanbanColumn.tsx: a column with rename, move left/right, delete, card list, and new-card form.
- components/KanbanCard.tsx: draggable card with inline edit (title, details, priority, due date) and delete.
- components/CardMeta.tsx: priority badge and due date (red when overdue).
- components/KanbanCardPreview.tsx: preview shown while dragging a card.
- components/NewCardForm.tsx: form used to create a new card in a column.
- components/ChatSidebar.tsx: AI chat for the active board. A failed turn is removed and its text restored to the input.
- components/icons.tsx: inline SVG icons.
- lib/api.ts: `request` helper; throws `ApiError` with the backend's `detail` message.
- lib/authApi.ts, lib/boardApi.ts, lib/chatApi.ts: API clients.
- lib/kanban.ts: board types, `moveCard` drag/drop logic, `matchesFilter`, and due date helpers.
- test/fakeApi.ts: in-memory fake of the backend API installed as `fetch`, used by component tests.
- test/boardFixture.ts: demo board used by component tests (mirrors `backend/app/seed.py`).

## Data model

- BoardData: { id, name, description, columns, cards }
- BoardSummary: { id, name, description, card_count, created_at, updated_at }
- Column: { id, title, cardIds }
- Card: { id, title, details, priority: "none" | "low" | "medium" | "high", due_date: "YYYY-MM-DD" | null }

Cards are a map by id, and each column holds the ordered card ids.

## Drag and drop

`KanbanBoard` uses a custom collision detector: `pointerWithin` first, falling back to `closestCorners`. `closestCorners` alone ranks tall empty columns below nearby cards, which made empty columns impossible to drop into.

Filtering dims non-matching cards instead of hiding them, so drop positions still match the full column order.

## Testing

- Vitest, React Testing Library, and jsdom for unit and component tests. Use `installFakeApi()` from `test/fakeApi.ts` rather than hand-written fetch stubs.
- Playwright for end-to-end tests against the real stack. It builds the static export and starts the backend with `uv run --project backend` on port 8001, using a fresh SQLite file per run. Each test registers its own user with `setup(page)`, so tests do not share state.
- jsdom does not model `aria-disabled` inheritance; interaction bugs like that only show up in Playwright.

Commands:
- npm run test
- npm run lint
- npm run typecheck
- npm run test:e2e
- npm run build

## Working conventions

- Keep changes simple.
- Prefer direct, readable React components over heavy abstraction.
- Follow the existing styling approach using utility classes and the CSS variables in `app/globals.css`. Check variable names against that file, since a misspelled `var(--...)` silently renders nothing.
