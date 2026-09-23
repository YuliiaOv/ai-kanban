from pathlib import Path
import os

from fastapi import FastAPI, HTTPException, Response
from fastapi.responses import FileResponse, HTMLResponse
from pydantic import BaseModel, Field

from .database import (
  create_card,
  delete_card,
  get_board,
  initialize_database,
  rename_column,
  update_card,
)
from .ai import ChatRequest, ChatResult, OpenRouterError, apply_operations, request_openrouter

PROJECT_ROOT = Path(__file__).resolve().parent.parent.parent
FRONTEND_BUILD_DIR = PROJECT_ROOT / "frontend" / "out"

app = FastAPI(title="Project Management MVP", version="0.1.0")
app.state.database_path = Path(
  os.getenv("PM_DATABASE_PATH", str(PROJECT_ROOT / "data" / "app.db"))
)


class ColumnRename(BaseModel):
  title: str = Field(min_length=1)


class CardCreate(BaseModel):
  column_id: str
  title: str = Field(min_length=1)
  details: str = ""


class CardUpdate(BaseModel):
  title: str | None = Field(default=None, min_length=1)
  details: str | None = None
  column_id: str | None = None
  position: int | None = Field(default=None, ge=0)


@app.on_event("startup")
async def initialize_app_database() -> None:
  initialize_database(app.state.database_path)


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


@app.post("/api/chat")
async def chat(payload: ChatRequest) -> ChatResult:
  try:
    result = request_openrouter(get_board(app.state.database_path), payload)
    apply_operations(app.state.database_path, result.operations)
  except (LookupError, OpenRouterError) as error:
    raise HTTPException(status_code=502, detail=str(error)) from error
  result.board_updated = bool(result.operations)
  return result


@app.get("/api/board")
async def read_board() -> dict:
  try:
    return get_board(app.state.database_path)
  except LookupError as error:
    raise HTTPException(status_code=404, detail=str(error)) from error


@app.patch("/api/board/columns/{column_id}")
async def update_column(column_id: str, payload: ColumnRename) -> dict[str, str]:
  try:
    rename_column(app.state.database_path, column_id, payload.title)
  except LookupError as error:
    raise HTTPException(status_code=404, detail=str(error)) from error
  return {"status": "updated"}


@app.post("/api/board/cards", status_code=201)
async def add_card(payload: CardCreate) -> dict[str, str]:
  try:
    card_id = create_card(
      app.state.database_path, payload.column_id, payload.title, payload.details
    )
  except LookupError as error:
    raise HTTPException(status_code=404, detail=str(error)) from error
  return {"id": card_id, "status": "created"}


@app.patch("/api/board/cards/{card_id}")
async def edit_card(card_id: str, payload: CardUpdate) -> dict[str, str]:
  try:
    update_card(
      app.state.database_path,
      card_id,
      payload.title,
      payload.details,
      payload.column_id,
      payload.position,
    )
  except LookupError as error:
    raise HTTPException(status_code=404, detail=str(error)) from error
  return {"status": "updated"}


@app.delete("/api/board/cards/{card_id}")
async def remove_card(card_id: str) -> dict[str, str]:
  try:
    delete_card(app.state.database_path, card_id)
  except LookupError as error:
    raise HTTPException(status_code=404, detail=str(error)) from error
  return {"status": "deleted"}


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
