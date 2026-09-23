export type ChatMessage = {
  role: "user" | "assistant";
  content: string;
};

export type ChatResponse = {
  message: string;
  operations: Array<{
    type: "create" | "update" | "move" | "delete";
    card_id?: string;
    column_id?: string;
    title?: string;
    details?: string;
    position?: number;
  }>;
  board_updated: boolean;
};

export const sendChatMessage = (message: string, history: ChatMessage[]) =>
  fetch("/api/chat", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ message, history }),
  }).then(async (response) => {
    if (!response.ok) {
      const payload = await response.json().catch(() => undefined);
      throw new Error(payload?.detail || "Unable to reach the AI assistant.");
    }
    return response.json() as Promise<ChatResponse>;
  });