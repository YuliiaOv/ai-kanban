from pathlib import Path

from fastapi import FastAPI, Response
from fastapi.responses import FileResponse, HTMLResponse

PROJECT_ROOT = Path(__file__).resolve().parent.parent.parent
FRONTEND_BUILD_DIR = PROJECT_ROOT / "frontend" / "out"

app = FastAPI(title="Project Management MVP", version="0.1.0")


def _fallback_root_response() -> str:
    return """
    <!doctype html>
    <html lang="en">
      <head>
        <meta charset="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <title>Project Management MVP</title>
        <style>
          body {
            font-family: Arial, sans-serif;
            margin: 0;
            min-height: 100vh;
            display: grid;
            place-items: center;
            background: #f3f6fb;
            color: #032147;
          }
          main {
            text-align: center;
            background: white;
            border-radius: 18px;
            padding: 48px 64px;
            box-shadow: 0 12px 32px rgba(3, 33, 71, 0.08);
          }
          button {
            margin-top: 18px;
            padding: 10px 18px;
            border: none;
            border-radius: 999px;
            background: #753991;
            color: white;
            cursor: pointer;
            font-weight: 600;
          }
        </style>
      </head>
      <body>
        <main>
          <h1>Hello world</h1>
          <p>Project Management MVP is running.</p>
          <button id="api-button" type="button">Call API</button>
          <p id="api-result">Waiting for API response...</p>
          <script>
            document.getElementById('api-button').addEventListener('click', async () => {
              const response = await fetch('/api/hello');
              const payload = await response.json();
              document.getElementById('api-result').textContent = payload.message;
            });
          </script>
        </main>
      </body>
    </html>
    """


@app.get("/")
async def read_root() -> Response:
    if FRONTEND_BUILD_DIR.exists() and (FRONTEND_BUILD_DIR / "index.html").exists():
        return FileResponse(FRONTEND_BUILD_DIR / "index.html")
    return HTMLResponse(_fallback_root_response())


@app.get("/api/health")
async def health() -> dict[str, str]:
    return {"status": "ok", "message": "Backend is running"}


@app.get("/api/hello")
async def hello() -> dict[str, str]:
    return {"message": "hello world"}


@app.get("/{path:path}")
async def serve_frontend(path: str) -> Response:
    if path.startswith("api/"):
        return HTMLResponse(_fallback_root_response())

    if FRONTEND_BUILD_DIR.exists():
        requested_path = (FRONTEND_BUILD_DIR / path).resolve()
        if requested_path.is_file() and FRONTEND_BUILD_DIR in requested_path.parents:
            return FileResponse(requested_path)

        index_path = (FRONTEND_BUILD_DIR / "index.html").resolve()
        if index_path.exists():
            return FileResponse(index_path)

    return HTMLResponse(_fallback_root_response())
