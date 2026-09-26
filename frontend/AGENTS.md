# Frontend project guide

This folder contains the Next.js frontend for the Kanban MVP. It is built as a static export (`output: "export"`) and served by the FastAPI backend, which also provides all data under `/api`.

## App structure

- app/page.tsx: entry point. Client-side sign-in gate (hardcoded `user` / `password`), then the board.
- components/KanbanBoard.tsx: loads the board from the API, orchestrates drag and drop, and refreshes from the backend after each change.
- components/KanbanColumn.tsx: a single column with title renaming, card list, and new-card form.
- components/KanbanCard.tsx: draggable card with inline edit and delete.
- components/KanbanCardPreview.tsx: preview shown while dragging a card.
- components/NewCardForm.tsx: form used to create a new card in a column.
- components/icons.tsx: inline SVG icons (edit, delete, add, send, log out).
- components/ChatSidebar.tsx: AI chat panel. It sends the current message plus earlier turns to `POST /api/chat` and refreshes the board when `board_updated` is true.
- lib/boardApi.ts: client for the board routes.
- lib/chatApi.ts: client for `POST /api/chat`.
- lib/kanban.ts: board types and the `moveCard` drag/drop logic.
- test/boardFixture.ts: seed board used by component tests (mirrors the backend seed).

## Data model

- BoardData: { columns, cards }
- Column: { id, title, cardIds }
- Card: { id, title, details }

Cards are a map by id, and each column holds the ordered card ids.

## Drag and drop

`KanbanBoard` uses a custom collision detector: `pointerWithin` first, falling back to `closestCorners`. `closestCorners` alone ranks tall empty columns below nearby cards, which made empty columns impossible to drop into.

## Testing

- Vitest, React Testing Library, and jsdom for unit and component tests
- Playwright for end-to-end tests against the real stack. It builds the static export and starts the backend with `uv run --project backend` on port 8001, using a fresh SQLite file per run.

Commands:
- npm run test
- npm run lint
- npm run typecheck
- npm run test:e2e
- npm run build

## Working conventions

- Keep changes simple and aligned with the MVP scope.
- Prefer direct, readable React components over heavy abstraction.
- Follow the existing styling approach using utility classes and the CSS variables in `app/globals.css`. Check variable names against that file, since a misspelled `var(--...)` silently renders nothing.
