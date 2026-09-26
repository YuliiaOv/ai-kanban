import os
from contextlib import asynccontextmanager
from datetime import date
from pathlib import Path
from typing import Annotated

from fastapi import APIRouter, FastAPI, HTTPException, Request, Response
from fastapi.responses import FileResponse, JSONResponse, PlainTextResponse
from pydantic import BaseModel, Field, StringConstraints

from . import boards
from .ai import ChatRequest, ChatResult, OpenRouterError, Priority, apply_operations, request_openrouter
from .auth import CurrentUser
from .auth import router as auth_router
from .database import connect
from .seed import initialize_database

PROJECT_ROOT = Path(__file__).resolve().parent.parent.parent
FRONTEND_BUILD_DIR = PROJECT_ROOT / "frontend" / "out"

Title = Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=200)]
Details = Annotated[str, Field(max_length=5000)]


@asynccontextmanager
async def lifespan(app: FastAPI):
    initialize_database(app.state.database_path)
    yield


app = FastAPI(title="Project Management", version="0.2.0", lifespan=lifespan)
app.state.database_path = Path(os.getenv("PM_DATABASE_PATH", str(PROJECT_ROOT / "data" / "app.db")))


@app.exception_handler(LookupError)
def not_found(_request: Request, error: LookupError) -> JSONResponse:
    return JSONResponse(status_code=404, content={"detail": str(error)})


class BoardCreate(BaseModel):
    name: Title
    description: Details = ""


class BoardUpdate(BaseModel):
    name: Title | None = None
    description: Details | None = None


class ColumnCreate(BaseModel):
    title: Title


class ColumnUpdate(BaseModel):
    title: Title | None = None
    position: int | None = Field(default=None, ge=0)


class CardCreate(BaseModel):
    column_id: str
    title: Title
    details: Details = ""
    priority: Priority = "none"
    due_date: date | None = None


class CardUpdate(BaseModel):
    title: Title | None = None
    details: Details | None = None
    priority: Priority | None = None
    # Sending null clears the due date; leaving it out keeps it.
    due_date: date | None = None
    column_id: str | None = None
    position: int | None = Field(default=None, ge=0)


def _connect():
    return connect(app.state.database_path)


@app.get("/api/health")
def health() -> dict[str, str]:
    return {"status": "ok", "message": "Backend is running"}


router = APIRouter(prefix="/api/boards")


@router.get("")
def list_boards(user: CurrentUser) -> list[dict]:
    with _connect() as connection:
        return boards.list_boards(connection, user.id)


@router.post("", status_code=201)
def create_board(payload: BoardCreate, user: CurrentUser) -> dict:
    with _connect() as connection:
        board_id = boards.create_board(connection, user.id, payload.name, payload.description)
        return boards.get_board(connection, board_id)


@router.get("/{board_id}")
def read_board(board_id: str, user: CurrentUser) -> dict:
    with _connect() as connection:
        boards.require_board(connection, board_id, user.id)
        return boards.get_board(connection, board_id)


@router.patch("/{board_id}")
def update_board(board_id: str, payload: BoardUpdate, user: CurrentUser) -> dict[str, str]:
    with _connect() as connection:
        boards.require_board(connection, board_id, user.id)
        boards.update_board(connection, board_id, payload.model_dump(exclude_none=True))
    return {"status": "updated"}


@router.delete("/{board_id}")
def delete_board(board_id: str, user: CurrentUser) -> dict[str, str]:
    with _connect() as connection:
        boards.require_board(connection, board_id, user.id)
        boards.delete_board(connection, board_id)
    return {"status": "deleted"}


@router.post("/{board_id}/columns", status_code=201)
def add_column(board_id: str, payload: ColumnCreate, user: CurrentUser) -> dict[str, str]:
    with _connect() as connection:
        boards.require_board(connection, board_id, user.id)
        column_id = boards.create_column(connection, board_id, payload.title)
    return {"id": column_id, "status": "created"}


@router.patch("/{board_id}/columns/{column_id}")
def edit_column(board_id: str, column_id: str, payload: ColumnUpdate, user: CurrentUser) -> dict[str, str]:
    with _connect() as connection:
        boards.require_board(connection, board_id, user.id)
        boards.update_column(connection, board_id, column_id, payload.title, payload.position)
    return {"status": "updated"}


@router.delete("/{board_id}/columns/{column_id}")
def remove_column(board_id: str, column_id: str, user: CurrentUser) -> dict[str, str]:
    with _connect() as connection:
        boards.require_board(connection, board_id, user.id)
        boards.delete_column(connection, board_id, column_id)
    return {"status": "deleted"}


@router.post("/{board_id}/cards", status_code=201)
def add_card(board_id: str, payload: CardCreate, user: CurrentUser) -> dict[str, str]:
    with _connect() as connection:
        boards.require_board(connection, board_id, user.id)
        card_id = boards.create_card(
            connection,
            board_id,
            payload.column_id,
            payload.title,
            payload.details,
            payload.priority,
            payload.due_date.isoformat() if payload.due_date else None,
        )
    return {"id": card_id, "status": "created"}


@router.patch("/{board_id}/cards/{card_id}")
def edit_card(board_id: str, card_id: str, payload: CardUpdate, user: CurrentUser) -> dict[str, str]:
    # Only due_date may be cleared with an explicit null; other null fields mean "unchanged".
    changes = {
        field: value
        for field, value in payload.model_dump(exclude_unset=True).items()
        if value is not None or field == "due_date"
    }
    if changes.get("due_date"):
        changes["due_date"] = changes["due_date"].isoformat()
    with _connect() as connection:
        boards.require_board(connection, board_id, user.id)
        boards.update_card(connection, board_id, card_id, changes)
    return {"status": "updated"}


@router.delete("/{board_id}/cards/{card_id}")
def remove_card(board_id: str, card_id: str, user: CurrentUser) -> dict[str, str]:
    with _connect() as connection:
        boards.require_board(connection, board_id, user.id)
        boards.delete_card(connection, board_id, card_id)
    return {"status": "deleted"}


@router.post("/{board_id}/chat")
def chat(board_id: str, payload: ChatRequest, user: CurrentUser) -> ChatResult:
    with _connect() as connection:
        boards.require_board(connection, board_id, user.id)
        board = boards.get_board(connection, board_id)
    try:
        # The AI call runs outside any transaction so the database is not held while waiting.
        result = request_openrouter(board, payload)
        with _connect() as connection:
            apply_operations(connection, board_id, result.operations)
    except OpenRouterError as error:
        raise HTTPException(status_code=502, detail=str(error)) from error
    result.board_updated = bool(result.operations)
    return result


app.include_router(auth_router)
app.include_router(router)


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
