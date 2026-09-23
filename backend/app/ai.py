import json
import os
import sqlite3
from typing import Literal
from urllib.error import HTTPError, URLError
from urllib.request import Request, urlopen

from pydantic import BaseModel, Field, ValidationError

from .database import create_card, delete_card, get_board, update_card

DEFAULT_MODEL = "nvidia/nemotron-3-ultra-550b-a55b:free"
OPENROUTER_URL = "https://openrouter.ai/api/v1/chat/completions"


class BoardOperation(BaseModel):
    type: Literal["create", "update", "move", "delete"]
    card_id: str | None = None
    column_id: str | None = None
    title: str | None = Field(default=None, min_length=1)
    details: str | None = None
    position: int | None = Field(default=None, ge=0)


class ChatMessage(BaseModel):
    role: Literal["user", "assistant"]
    content: str


class ChatRequest(BaseModel):
    message: str = Field(min_length=1)
    history: list[ChatMessage] = Field(default_factory=list)


class ChatResult(BaseModel):
    message: str = Field(min_length=1)
    operations: list[BoardOperation] = Field(default_factory=list)
    board_updated: bool = False


class OpenRouterError(Exception):
    pass


NULLABLE_STRING = {"type": ["string", "null"]}

# Strict structured output: every field is required, optional values are null.
RESPONSE_SCHEMA = {
    "type": "object",
    "additionalProperties": False,
    "required": ["message", "operations"],
    "properties": {
        "message": {"type": "string"},
        "operations": {
            "type": "array",
            "items": {
                "type": "object",
                "additionalProperties": False,
                "required": ["type", "card_id", "column_id", "title", "details", "position"],
                "properties": {
                    "type": {"type": "string", "enum": ["create", "update", "move", "delete"]},
                    "card_id": NULLABLE_STRING,
                    "column_id": NULLABLE_STRING,
                    "title": NULLABLE_STRING,
                    "details": NULLABLE_STRING,
                    "position": {"type": ["integer", "null"]},
                },
            },
        },
    },
}


def _system_prompt() -> str:
    return (
        "You are a project management assistant. Reply with a user-facing message and a list of board operations. "
        "Use create with column_id, title, and details; update with card_id and changed fields; "
        "move with card_id, column_id, and position; delete with card_id. "
        "Set operation fields that do not apply to null. "
        "Use an empty operations array for conversation that does not change the board."
    )


def request_openrouter(board: dict, payload: ChatRequest) -> ChatResult:
    api_key = os.getenv("OPENROUTER_API_KEY", "").strip()
    if not api_key:
        raise OpenRouterError("OPENROUTER_API_KEY is not configured.")

    request_body = {
        "model": os.getenv("OPENROUTER_MODEL", DEFAULT_MODEL),
        "messages": [
            {"role": "system", "content": _system_prompt()},
            {"role": "system", "content": f"Current board JSON: {json.dumps(board)}"},
            *(message.model_dump() for message in payload.history),
            {"role": "user", "content": payload.message},
        ],
        "response_format": {
            "type": "json_schema",
            "json_schema": {"name": "chat_result", "strict": True, "schema": RESPONSE_SCHEMA},
        },
    }
    request = Request(
        OPENROUTER_URL,
        data=json.dumps(request_body).encode("utf-8"),
        headers={
            "Authorization": f"Bearer {api_key}",
            "Content-Type": "application/json",
            "HTTP-Referer": "http://localhost:8000",
            "X-Title": "Project Management MVP",
        },
        method="POST",
    )
    try:
        with urlopen(request, timeout=60) as response:
            response_body = json.loads(response.read().decode("utf-8"))
    except (HTTPError, URLError, TimeoutError, json.JSONDecodeError) as error:
        raise OpenRouterError("The AI service could not be reached.") from error

    # OpenRouter reports upstream failures (e.g. provider overload) as HTTP 200 with an error body,
    # or as a choice that finished with an error and no content.
    if "error" in response_body:
        raise OpenRouterError(f"The AI service returned an error: {response_body['error']['message']}")

    try:
        choice = response_body["choices"][0]
        if choice.get("finish_reason") == "error":
            raise OpenRouterError("The AI service failed while generating a response.")
        content = choice["message"]["content"]
        parsed = json.loads(content)
        result = ChatResult.model_validate(parsed)
    except (KeyError, IndexError, TypeError, json.JSONDecodeError, ValidationError) as error:
        raise OpenRouterError("The AI returned an invalid structured response.") from error
    return result


def apply_operations(connection: sqlite3.Connection, operations: list[BoardOperation]) -> None:
    """Validate and apply operations on the caller's connection, so they commit or roll back together."""
    board = get_board(connection)
    column_ids = {column["id"] for column in board["columns"]}
    card_ids = set(board["cards"])

    for operation in operations:
        if operation.type == "create":
            if not operation.column_id or not operation.title or operation.column_id not in column_ids:
                raise OpenRouterError("The AI returned an invalid create operation.")
        else:
            if not operation.card_id or operation.card_id not in card_ids:
                raise OpenRouterError("The AI returned an invalid card operation.")
            if operation.type == "move" and (
                not operation.column_id or operation.column_id not in column_ids or operation.position is None
            ):
                raise OpenRouterError("The AI returned an invalid move operation.")
            if operation.type == "update" and all(
                value is None for value in (operation.title, operation.details, operation.column_id, operation.position)
            ):
                raise OpenRouterError("The AI returned an empty update operation.")

    for operation in operations:
        if operation.type == "create":
            create_card(connection, operation.column_id, operation.title, operation.details or "")
        elif operation.type in {"update", "move"}:
            update_card(
                connection,
                operation.card_id,
                operation.title,
                operation.details,
                operation.column_id,
                operation.position,
            )
        elif operation.type == "delete":
            delete_card(connection, operation.card_id)
