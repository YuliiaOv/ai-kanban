import type { BoardData } from "@/lib/kanban";

type CardPayload = {
  title?: string;
  details?: string;
  column_id?: string;
  position?: number;
};

const request = async <T>(path: string, options?: RequestInit): Promise<T> => {
  const response = await fetch(path, {
    headers: { "Content-Type": "application/json" },
    ...options,
  });

  if (!response.ok) {
    throw new Error(`Request failed with status ${response.status}`);
  }

  return response.status === 204 ? (undefined as T) : response.json();
};

export const fetchBoard = () => request<BoardData>("/api/board");

export const renameColumn = (columnId: string, title: string) =>
  request(`/api/board/columns/${columnId}`, {
    method: "PATCH",
    body: JSON.stringify({ title }),
  });

export const createCard = (columnId: string, title: string, details: string) =>
  request<{ id: string }>("/api/board/cards", {
    method: "POST",
    body: JSON.stringify({ column_id: columnId, title, details }),
  });

export const updateCard = (cardId: string, payload: CardPayload) =>
  request(`/api/board/cards/${cardId}`, {
    method: "PATCH",
    body: JSON.stringify(payload),
  });

export const deleteCard = (cardId: string) =>
  request(`/api/board/cards/${cardId}`, { method: "DELETE" });
