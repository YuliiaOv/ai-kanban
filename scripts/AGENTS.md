# Scripts

Start and stop the Docker stack from the project root, one pair per platform:

- `start.sh` / `stop.sh`: Mac and Linux
- `start.ps1` / `stop.ps1`: Windows PowerShell
- `start.cmd` / `stop.cmd`: Windows Command Prompt

`start.*` runs `docker compose up --build` in the foreground (app on http://localhost:8000). `stop.*` runs `docker compose down`. Docker must be running.
