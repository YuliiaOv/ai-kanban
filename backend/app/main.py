import os
from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import FastAPI, HTTPException, Response
from fastapi.responses import FileResponse, PlainTextResponse
from pydantic import BaseModel, Field

from .ai import ChatRequest, ChatResult, OpenRouterError, apply_operations, request_openrouter
from .database import (
    connect,
    create_card,
    delete_card,
    get_board,
    initialize_database,
    rename_column,
    update_card,
)

PROJECT_ROOT = Path(__file__).resolve().parent.parent.parent
FRONTEND_BUILD_DIR = PROJECT_ROOT / "frontend" / "out"


@asynccontextmanager
async def lifespan(app: FastAPI):
    initialize_database(app.state.database_path)
    yield


app = FastAPI(title="Project Management MVP", version="0.1.0", lifespan=lifespan)
app.state.database_path = Path(os.getenv("PM_DATABASE_PATH", str(PROJECT_ROOT / "data" / "app.db")))


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


def _connect():
    return connect(app.state.database_path)


@app.get("/api/health")
def health() -> dict[str, str]:
    return {"status": "ok", "message": "Backend is running"}


@app.post("/api/chat")
def chat(payload: ChatRequest) -> ChatResult:
    try:
        with _connect() as connection:
            board = get_board(connection)
        # The AI call runs outside any transaction so the database is not held while waiting.
        result = request_openrouter(board, payload)
        with _connect() as connection:
            apply_operations(connection, result.operations)
    except (LookupError, OpenRouterError) as error:
        raise HTTPException(status_code=502, detail=str(error)) from error
    result.board_updated = bool(result.operations)
    return result


@app.get("/api/board")
def read_board() -> dict:
    try:
        with _connect() as connection:
            return get_board(connection)
    except LookupError as error:
        raise HTTPException(status_code=404, detail=str(error)) from error


@app.patch("/api/board/columns/{column_id}")
def update_column(column_id: str, payload: ColumnRename) -> dict[str, str]:
    try:
        with _connect() as connection:
            rename_column(connection, column_id, payload.title)
    except LookupError as error:
        raise HTTPException(status_code=404, detail=str(error)) from error
    return {"status": "updated"}


@app.post("/api/board/cards", status_code=201)
def add_card(payload: CardCreate) -> dict[str, str]:
    try:
        with _connect() as connection:
            card_id = create_card(connection, payload.column_id, payload.title, payload.details)
    except LookupError as error:
        raise HTTPException(status_code=404, detail=str(error)) from error
    return {"id": card_id, "status": "created"}


@app.patch("/api/board/cards/{card_id}")
def edit_card(card_id: str, payload: CardUpdate) -> dict[str, str]:
    try:
        with _connect() as connection:
            update_card(
                connection,
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
def remove_card(card_id: str) -> dict[str, str]:
    try:
        with _connect() as connection:
            delete_card(connection, card_id)
    except LookupError as error:
        raise HTTPException(status_code=404, detail=str(error)) from error
    return {"status": "deleted"}


@app.get("/{path:path}")
def serve_frontend(path: str) -> Response:
    if path.startswith("api/"):
        raise HTTPException(status_code=404, detail="Not found")

    requested_path = (FRONTEND_BUILD_DIR / path).resolve()
    if requested_path.is_file() and FRONTEND_BUILD_DIR in requested_path.parents:
        return FileResponse(requested_path)

    index_path = FRONTEND_BUILD_DIR / "index.html"
    if index_path.is_file():
        return FileResponse(index_path)
    return PlainTextResponse("Frontend build not found. Run `npm run build` in frontend/.", status_code=503)
