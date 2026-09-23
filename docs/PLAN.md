# Project plan

Status: Parts 1-10 complete; unit, backend, and Playwright end-to-end suites pass.

## Part 1: Planning and project framing

Goal: Confirm the working scope, align the repo structure to the product requirements, and define execution checkpoints before starting code changes.

Checklist:
- [x] Review the root project instructions in [AGENTS.md](../AGENTS.md) and confirm the product scope, constraints, and technology decisions.
- [x] Review the current frontend project structure and confirm the existing demo Kanban implementation that will be built on.
- [x] Create a detailed execution plan for each remaining phase with verification steps and success criteria.
- [x] Create a frontend-specific agent guide in [frontend/AGENTS.md](../frontend/AGENTS.md) describing the current app layout, data model, and testing setup.
- [x] Present the plan to the user for approval before any implementation work is started.

Tests and validation for Part 1:
- Confirm the plan includes explicit test coverage expectations for every phase.
- Confirm the frontend guide accurately reflects the current code structure.
- Confirm the user reviews and approves the plan before proceeding to Part 2.

Success criteria:
- The project plan is specific enough for an agent to execute in sequence without reinterpreting scope.
- The plan names the build/test commands expected at each milestone.
- The plan is reviewed and accepted before code work begins.

---

## Part 2: Scaffolding and local container baseline

Goal: Create the Dockerized local environment and the FastAPI backend shell so the app can run in a container and serve a basic proof-of-life endpoint.

Checklist:
- [x] Create or update the Docker configuration for the app stack.
- [x] Set up the backend project structure in [backend](../backend) using FastAPI.
- [x] Add Python dependency management with uv and confirm the correct package installation flow in Docker.
- [x] Create start and stop scripts in [scripts](../scripts) for Mac, PC, and Linux.
- [x] Serve a minimal hello-world page at the app root to confirm the stack runs locally.
- [x] Create a basic API endpoint that returns a simple success payload and verify it works from the running app.

Tests and validation for Part 2:
- Run the app locally via the scripts.
- Confirm the root route responds successfully.
- Confirm the backend API endpoint returns expected JSON.
- Validate the container setup does not fail on fresh startup.

Success criteria:
- The local app starts without manual code hacking.
- The root route serves content.
- The API route returns a valid response body.

---

## Part 3: Frontend integration and static serving

Goal: Make the frontend build as a static app and serve it from the backend so the Kanban demo is visible at the root URL.

Checklist:
- [x] Confirm the Next.js app can build successfully in production mode.
- [x] Update the app so it can be served by the backend from the root path.
- [x] Ensure the demo Kanban board renders at / as the primary application entry point.
- [x] Run frontend unit tests and integration tests for the board UI.
- [x] Verify the app loads correctly in the browser without requiring the standalone dev server.

Tests and validation for Part 3:
- Run the frontend test suite.
- Run a production build of the frontend.
- Check the app responds at / in the containerized environment.
- Validate the board renders with all expected columns/cards.

Success criteria:
- The production build completes successfully.
- The app is served from the backend root route.
- The board is visible and stable in the browser.

---

## Part 4: Fake user sign-in flow

Goal: Add a basic login gate using the hardcoded credentials user / password before the Kanban can be accessed.

Checklist:
- [x] Add a login screen before the board is visible.
- [x] Implement a simple in-memory auth flow with the required dummy credentials.
- [x] Add logout behavior and ensure the user is returned to the sign-in experience.
- [x] Restrict access to the board until authentication succeeds.
- [x] Add tests covering both valid and invalid login attempts.

Tests and validation for Part 4:
- Test successful login with user / password.
- Test failed login with wrong credentials.
- Test logout returns the user to the sign-in page.
- Ensure the board cannot be accessed without authentication.

Success criteria:
- A user must authenticate to access the board.
- The login flow is simple, intentional, and uses the hardcoded MVP credentials.
- All auth behaviors are covered by automated tests.

---

## Part 5: Database modeling and schema proposal

Goal: Define a database structure for the Kanban board with future multi-user support in mind while staying within the MVP constraints.

Checklist:
- [x] Document the intended database approach and storage model for users, boards, columns, and cards.
- [x] Save a draft schema file in JSON format under the docs directory.
- [x] Keep the design compatible with SQLite and future multi-user expansion.
- [x] Present the schema to the user for approval before backend implementation begins.

Tests and validation for Part 5:
- Check schema consistency against the required app features.
- Ensure IDs, relationships, and column/card storage match the board model.
- Confirm the proposal is aligned with future database extensibility.

Success criteria:
- The schema matches the board behavior and MVP constraints.
- The design is documented clearly and approved before code changes are made.

---

## Part 6: Backend API for Kanban persistence

Goal: Add backend routes to read and change the board for a signed-in user, with SQLite initialized automatically when missing.

Checklist:
- [x] Define the database initialization and migration strategy.
- [x] Create the SQLite database if it does not exist.
- [x] Implement API routes to fetch the user board.
- [x] Implement API routes to update card movement, column renames, card creation/editing, and deletion.
- [x] Add backend unit tests covering success and failure scenarios.

Tests and validation for Part 6:
- Verify database creation on initial startup.
- Verify CRUD-style behaviors for board changes.
- Verify a user-specific board is isolated.
- Run backend unit tests for the API layer and persistence logic.

Success criteria:
- The API successfully persists board state.
- Data is scoped to the current user.
- The database is created automatically when absent.

---

## Part 7: Frontend connected to backend persistence

Goal: Replace local in-memory board state with persistent backend API calls so the board remains saved across reloads.

Checklist:
- [x] Replace demo-only board state with API-backed fetch and update flows.
- [x] Ensure sign-in state and board data coordinate correctly.
- [x] Persist card moves, column renames, card edits, and card add/delete actions to the backend.
- [x] Refresh the UI after each successful mutation.
- [x] Run thorough frontend and integration tests for the real persistence flow.

Tests and validation for Part 7:
- Test loading board data from the API.
- Test mutation flows for drag/drop and card edits.
- Test refresh after updates.
- Validate persistence across a full reload.

Success criteria:
- The board remains consistent after reloads.
- Data changes are persisted instead of living only in browser memory.
- No user-visible mismatch exists between UI and backend state.

---

## Part 8: AI connectivity with OpenRouter

Goal: Establish a working OpenRouter integration and verify the backend can call the configured model successfully.

Checklist:
- [x] Add backend support for the configured OpenRouter API key and model.
- [x] Ensure the application handles environment configuration cleanly.
- [x] Make a minimal test request such as 2 + 2.
- [x] Confirm the response can be parsed and surfaced as valid output.

Tests and validation for Part 8:
- [x] Run a minimal AI call via the backend using the configured OpenRouter provider.
- [x] Confirm the live response is successfully parsed and returned by the client (`4`, with no board operations).
- [x] Validate failure handling for missing/invalid API configuration.

Success criteria:
- The backend can call the LLM successfully via OpenRouter.
- The response is captured and interpretable by the application.

---

## Part 9: AI board-aware structured responses

Goal: Send the board JSON, the user message, and conversation context to the AI and require structured output with both a user-facing response and optional board updates.

Checklist:
- [x] Expand the backend AI request payload to include the current board state and chat history.
- [x] Define a structured response schema with a message and optional Kanban changes.
- [x] Validate the AI output against the expected schema.
- [x] Apply optional board updates with safety checks.
- [x] Add thorough tests covering both normal and malformed AI responses.

Tests and validation for Part 9:
- [x] Test a chat prompt that requires only a text answer.
- [x] Test a prompt that requires a small board update.
- [x] Test invalid or incomplete AI output handling.
- [x] Confirm the app can parse and apply structured updates safely.

Success criteria:
- The AI receives enough context to reason about the board.
- Structured outputs are enforced and parsed reliably.
- Optional board edits are applied only when valid.

---

## Part 10: Sidebar AI chat and automatic UI refresh

Goal: Deliver the final user experience: a side-panel chat interface with AI-powered board updates that immediately refresh the UI.

Checklist:
- [x] Build a sidebar chat UI in the frontend with conversation history and input controls.
- [x] Wire the frontend to the backend AI endpoint.
- [x] Allow the AI to send structured board updates when appropriate.
- [x] Refresh the UI automatically whenever the board is updated by the AI.
- [x] Run end-to-end tests covering the AI-assisted workflow.

Tests and validation for Part 10:
- [x] Test sending a prompt to the AI through the UI in a browser.
- [x] Test a board-changing AI response updates the UI automatically in a browser.
- [x] Test sending a prompt, displaying a text response, and refreshing after a board update in component tests.
- [x] Verify the experience works from a user perspective in a browser.

Success criteria:
- The user can chat with the AI from the sidebar.
- The AI can optionally update the board using structured output.
- The board refreshes without manual action after AI-driven updates.

---

## Notes on implementation order

The work must proceed in the order above. Each phase builds on the previous one and must not skip the required user approval checkpoints for planning, schema approval, and final scope confirmation.

The implementation should remain intentionally simple, avoid unnecessary abstraction, and keep the codebase aligned with the MVP constraints described in [AGENTS.md](../AGENTS.md).

## Current design decisions

- The frontend is built as a Next.js static export and served by FastAPI from the same Docker container; the browser calls backend routes under `/api`.
- The MVP sign-in remains client-side and in-memory with the hardcoded credentials `user` / `password`. It gates the board experience but is not production authentication or an API security boundary.
- SQLite is accessed through Python's standard-library `sqlite3` module. Database initialization creates the schema and seeds the MVP user, one board, five columns, and eight cards when the database is missing.
- The relational schema is documented in [docs/schema.json](schema.json): users own boards, boards own ordered columns and cards, and card placement is represented by `column_id` plus `position`.
- The MVP enforces one board per user with a database uniqueness constraint, while retaining user and board ownership fields for future multi-user expansion.
- Board persistence is exposed through `GET /api/board`, column rename, and card create/update/move/delete endpoints. The frontend refreshes board state from the API after successful mutations.
- Docker mounts `./data` to `/app/data` so the SQLite database survives image rebuilds and container recreation. Generated database files are excluded from version control.
- Part 7 currently uses a fixed MVP backend board scope. A future authenticated request context must replace that scope before multi-user isolation is considered complete.

## Validation record

- Part 1: planning and frontend guide completed and approved before implementation.
- Part 2: Docker/FastAPI baseline and proof-of-life endpoints validated.
- Part 3: static frontend build and backend serving validated.
- Part 4: sign-in, invalid credentials, logout, and password visibility covered by frontend tests.
- Part 5: [docs/schema.json](schema.json) approved before persistence implementation.
- Part 6: backend suite passes with database initialization, CRUD, movement, ordering, and error coverage.
- Part 7: frontend suite passes with API loading, rename, create, edit, delete, refresh, and Docker live API verification.
- Part 8: backend chat route, missing-key handling, and structured OpenRouter client implemented; live smoke test returned `4` successfully.
- Part 9: structured `create`, `update`, `move`, and `delete` operations validated before application; parser tests cover board context, chat history, and malformed operation responses.
- Part 10: sidebar chat UI and automatic board refresh implemented; frontend unit tests and production build pass. Playwright suite (10 tests) runs against FastAPI serving the static build with a fresh SQLite file per run and covers sign-in, card add/edit/delete, column rename, drag and drop (each verified after reload), AI chat replies, AI-driven board refresh, and a live OpenRouter card creation. Fixed a card layout overflow found by e2e: card action buttons spilled out of narrow columns and were covered by the chat sidebar.
- Docker: image builds and starts via `scripts/start.ps1`; container serves the frontend and API, receives `OPENROUTER_API_KEY` from `.env`, persists data across restarts through the `./data` volume, and passes the backend suite; `scripts/stop.ps1` removes it. The Dockerfile now installs dependencies from `backend/pyproject.toml` (added missing `httpx`). AI chat switched from `json_object` to strict `json_schema` output after live testing showed frequent malformed replies; OpenRouter provider errors are now reported with their real cause. The live Playwright AI test skips when the free provider reports it is overloaded.

## Definition of done for the overall project

The MVP is complete when:
- Users can sign in with the required dummy credentials.
- Each user sees a persisted Kanban board.
- Column names are editable.
- Cards can be moved, created, and deleted.
- The board is stored in SQLite and works in the local Docker environment.
- The backend can call OpenRouter and respond with structured AI output.
- The AI can assist through a sidebar chat and update the board when appropriate.
- All critical flows are covered by automated tests.