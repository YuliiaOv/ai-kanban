# The Project Management MVP web app

## Business Requirements

This project is building a Project Management App. Key features:
- Users create an account (username, password, optional display name), sign in, and stay signed in across reloads
- Users manage their account: change display name and password, delete the account
- Each user owns any number of Kanban boards, each with a name and description; boards are private to their owner
- Columns can be added, renamed, reordered, and deleted
- Cards can be created, edited, deleted, and moved with drag and drop; cards have details, a priority, and an optional due date
- Cards can be searched and filtered by priority
- There is an AI chat feature in a sidebar; the AI is able to create / edit / move / delete one or more cards on the current board

## Limitations

A demo account (`user` / `password`) is seeded with a sample board.

This runs locally (in a docker container). Session cookies are not marked `Secure`, since the app is served over plain HTTP on localhost.

## Technical Decisions

- NextJS frontend
- Python FastAPI backend, including serving the static NextJS site at /
- Everything packaged into a Docker container
- Use "uv" as the package manager for python in the Docker container
- Use OpenRouter for the AI calls. An OPENROUTER_API_KEY is in .env in the project root
- Use `nvidia/nemotron-3-ultra-550b-a55b:free` as the model
- Use SQLLite local database for the database, creating a new db if it doesn't exist
- Start and Stop server scripts for Mac, PC, Linux in scripts/

## Starting Point

A working MVP of the frontend has been built and is already in frontend. This is not yet designed for the Docker setup. It's a pure frontend-only demo.

## Color Scheme

- Accent Yellow: `#ecad0a` - accent lines, highlights
- Blue Primary: `#209dd7` - links, key sections
- Purple Secondary: `#753991` - submit buttons, important actions
- Dark Navy: `#032147` - main headings
- Gray Text: `#888888` - supporting text, labels

## Coding standards

1. Use latest versions of libraries and idiomatic approaches as of today
2. Keep it simple - NEVER over-engineer, ALWAYS simplify, NO unnecessary defensive programming. No extra features - focus on simplicity.
3. Be concise. Keep README minimal. IMPORTANT: no emojis ever
4. When hitting issues, always identify root cause before trying a fix. Do not guess. Prove with evidence, then fix the root cause.

## Working documentation

All documents for planning and executing this project will be in the docs/ directory.
Please review the docs/PLAN.md document before proceeding.