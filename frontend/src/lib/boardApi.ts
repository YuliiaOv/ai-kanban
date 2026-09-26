import { jsonBody, request } from "@/lib/api";
import type { BoardData, BoardSummary, Priority } from "@/lib/kanban";

export type CardPayload = {
  title?: string;
  details?: string;
  priority?: Priority;
  due_date?: string | null;
  column_id?: string;
  position?: number;
};

const boardPath = (boardId: string) => `/api/boards/${boardId}`;

export const listBoards = () => request<BoardSummary[]>("/api/boards");

export const createBoard = (name: string, description = "") =>
  request<BoardData>("/api/boards", jsonBody("POST", { name, description }));

export const fetchBoard = (boardId: string) => request<BoardData>(boardPath(boardId));

export const updateBoard = (boardId: string, payload: { name?: string; description?: string }) =>
  request(boardPath(boardId), jsonBody("PATCH", payload));

export const deleteBoard = (boardId: string) => request(boardPath(boardId), jsonBody("DELETE"));

export const createColumn = (boardId: string, title: string) =>
  request<{ id: string }>(`${boardPath(boardId)}/columns`, jsonBody("POST", { title }));

export const updateColumn = (
  boardId: string,
  columnId: string,
  payload: { title?: string; position?: number }
) => request(`${boardPath(boardId)}/columns/${columnId}`, jsonBody("PATCH", payload));

export const deleteColumn = (boardId: string, columnId: string) =>
  request(`${boardPath(boardId)}/columns/${columnId}`, jsonBody("DELETE"));

export const createCard = (boardId: string, columnId: string, title: string, details: string) =>
  request<{ id: string }>(
    `${boardPath(boardId)}/cards`,
    jsonBody("POST", { column_id: columnId, title, details })
  );

export const updateCard = (boardId: string, cardId: string, payload: CardPayload) =>
  request(`${boardPath(boardId)}/cards/${cardId}`, jsonBody("PATCH", payload));

export const deleteCard = (boardId: string, cardId: string) =>
  request(`${boardPath(boardId)}/cards/${cardId}`, jsonBody("DELETE"));
