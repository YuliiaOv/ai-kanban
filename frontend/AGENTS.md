# Frontend project guide

This folder contains the current Next.js frontend for the Kanban MVP. The app is a client-side demo that renders a single-board Kanban experience and is intended to be the base for the full product flow described in the root project instructions.

## Current app structure

- app/page.tsx: application entry point. It renders the Kanban board component.
- components/KanbanBoard.tsx: main board container and drag-and-drop orchestration.
- components/KanbanColumn.tsx: a single board column with renaming, card list, and new-card form.
- components/KanbanCard.tsx: draggable card element used inside columns.
- components/KanbanCardPreview.tsx: preview shown while dragging a card.
- components/NewCardForm.tsx: form used to create a new card in a column.
- components/ChatSidebar.tsx: AI conversation panel that sends chat requests and refreshes the board after AI mutations.
- lib/chatApi.ts: client contract for `POST /api/chat`.
- lib/kanban.ts: board data model, initial seed data, and drag/drop logic.

## Current behavior

The frontend currently demonstrates a single-board Kanban experience with:
- Five fixed columns
- Editable column titles
- Drag-and-drop card movement between columns and within a column
- Add-card flow per column
- Delete-card action per card
- Board state loaded from and persisted to the FastAPI backend
- Client-side sign-in gate using the MVP `user` / `password` credentials
- AI chat sidebar connected to the backend chat route

## Data model

The board state is shaped around two main objects:
- BoardData: { columns, cards }
- Column: { id, title, cardIds }
- Card: { id, title, details }

This structure is intentionally simple for the MVP and is built around a single board with a map of card records plus per-column ordering arrays.

## Testing setup

The frontend uses:
- Vitest for unit tests
- React Testing Library for component/user interaction tests
- Playwright for browser-level integration tests
- jsdom for DOM-based unit test execution

Relevant commands:
- npm run test
- npm run test:unit
- npm run test:e2e
- npm run build

## Working conventions

- Keep changes simple and aligned with the MVP scope.
- Prefer direct, readable React components over heavy abstraction.
- Follow the existing styling approach using utility classes and CSS variables defined in the app theme.
- Do not add major architecture changes unless required by the project phase.
- Preserve the existing board logic and component structure while adding the next milestone requirements.

## Important project context

The app is a frontend demo that has already been implemented and now needs to be adapted to the larger architecture described by the project plan:
- Dockerized app runtime
- FastAPI backend
- SQLite persistence
- User sign-in flow
- AI-enabled board interaction

The next work must respect the plan in the root-level docs and should not add unrelated features or re-architect the frontend beyond the current milestone.
