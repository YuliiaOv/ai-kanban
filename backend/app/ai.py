import json
import os
from dataclasses import dataclass
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


class ChatRequest(BaseModel):
  message: str = Field(min_length=1)
  history: list[dict[str, str]] = Field(default_factory=list)


class ChatResult(BaseModel):
  message: str = Field(min_length=1)
  operations: list[BoardOperation] = Field(default_factory=list)
  board_updated: bool = False


@dataclass
class OpenRouterError(Exception):
  message: str

  def __post_init__(self) -> None:
    super().__init__(self.message)


def _system_prompt() -> str:
  return (
    "You are a project management assistant. Return only valid JSON with this shape: "
    '{"message":"string","operations":[{"type":"create|update|move|delete",'
    '"card_id":"optional","column_id":"optional","title":"optional",'
    '"details":"optional","position":0}]}. '
    "Use create with column_id, title, and details; update with card_id and changed fields; "
    "move with card_id, column_id, and position; delete with card_id. "
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
      *payload.history,
      {"role": "user", "content": payload.message},
    ],
    "response_format": {"type": "json_object"},
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

  try:
    content = response_body["choices"][0]["message"]["content"]
    parsed = json.loads(content)
    result = ChatResult.model_validate(parsed)
  except (KeyError, IndexError, TypeError, json.JSONDecodeError, ValidationError) as error:
    raise OpenRouterError("The AI returned an invalid structured response.") from error
  return result


def apply_operations(database_path, operations: list[BoardOperation]) -> None:
  board = get_board(database_path)
  column_ids = {column["id"] for column in board["columns"]}
  card_ids = set(board["cards"])

  for operation in operations:
    if operation.type == "create":
      if not operation.column_id or not operation.title or operation.column_id not in column_ids:
        raise OpenRouterError("The AI returned an invalid create operation.")
    elif operation.type in {"update", "move", "delete"}:
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
    else:
      raise OpenRouterError("The AI returned an unsupported board operation.")

  for operation in operations:
    if operation.type == "create":
      create_card(database_path, operation.column_id, operation.title, operation.details or "")
    elif operation.type == "update":
      update_card(
        database_path,
        operation.card_id,
        operation.title,
        operation.details,
        operation.column_id,
        operation.position,
      )
    elif operation.type == "move":
      update_card(database_path, operation.card_id, column_id=operation.column_id, position=operation.position)
    elif operation.type == "delete":
      delete_card(database_path, operation.card_id)