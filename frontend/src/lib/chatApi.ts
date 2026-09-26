import { jsonBody, request } from "@/lib/api";

export type ChatMessage = {
  role: "user" | "assistant";
  content: string;
};

export type ChatResponse = {
  message: string;
  board_updated: boolean;
};

export const sendChatMessage = (boardId: string, message: string, history: ChatMessage[]) =>
  request<ChatResponse>(`/api/boards/${boardId}/chat`, jsonBody("POST", { message, history }));
