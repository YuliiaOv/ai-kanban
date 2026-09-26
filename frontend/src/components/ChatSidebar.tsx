"use client";

import { FormEvent, useState } from "react";
import { sendChatMessage, type ChatMessage } from "@/lib/chatApi";
import { SendIcon } from "@/components/icons";

type ChatSidebarProps = {
  boardId: string;
  onBoardUpdated: () => Promise<void>;
};

export const ChatSidebar = ({ boardId, onBoardUpdated }: ChatSidebarProps) => {
  const [messages, setMessages] = useState<ChatMessage[]>([
    { role: "assistant", content: "Ask me to shape the board or help plan the next move." },
  ]);
  const [draft, setDraft] = useState("");
  const [isSending, setIsSending] = useState(false);
  const [error, setError] = useState("");

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const message = draft.trim();
    if (!message || isSending) return;

    const nextMessages = [...messages, { role: "user" as const, content: message }];
    setMessages(nextMessages);
    setDraft("");
    setError("");
    setIsSending(true);
    try {
      // History is the earlier turns; the backend appends the current message itself.
      const response = await sendChatMessage(boardId, message, messages);
      setMessages((current) => [...current, { role: "assistant", content: response.message }]);
      if (response.board_updated) {
        await onBoardUpdated();
      }
    } catch (requestError) {
      // Drop the unanswered turn and give the text back, so the history stays in user/assistant pairs.
      setMessages(messages);
      setDraft(message);
      setError(requestError instanceof Error ? requestError.message : "Unable to send the message.");
    } finally {
      setIsSending(false);
    }
  };

  return (
    <aside className="flex h-[420px] flex-col rounded-2xl bg-[var(--navy-dark)] p-4 text-white shadow-[var(--shadow)] min-[1400px]:h-[calc(100vh-98px)]">
      <div className="border-b border-white/15 pb-3">
        <p className="text-xs font-semibold uppercase tracking-[0.28em] text-[var(--accent-yellow)]">
          Board assistant
        </p>
        <p className="mt-1 text-xs leading-5 text-white/60">Create, refine, move, or clear cards with a short request.</p>
      </div>

      <div className="flex-1 space-y-3 overflow-y-auto py-4" aria-live="polite">
        {messages.map((message, index) => (
          <div
            key={`${message.role}-${index}`}
            className={`max-w-[92%] rounded-xl px-3 py-2 text-sm leading-6 ${
              message.role === "user"
                ? "ml-auto bg-[var(--primary-blue)] text-white"
                : "bg-white/10 text-white/85"
            }`}
          >
            {message.content}
          </div>
        ))}
        {error ? <p className="rounded-xl border border-red-300/30 bg-red-400/15 px-3 py-2 text-sm text-red-100">{error}</p> : null}
      </div>

      <form onSubmit={handleSubmit} className="relative border-t border-white/15 pt-3">
        <label htmlFor="chat-message" className="sr-only">Message the board assistant</label>
        <textarea
          id="chat-message"
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          placeholder="Try: Move QA micro-interactions to Done"
          rows={3}
          className="w-full resize-none rounded-xl border border-white/15 bg-white/10 py-2.5 pl-3 pr-12 text-sm text-white outline-none placeholder:text-white/45 focus:border-[var(--accent-yellow)]"
          disabled={isSending}
        />
        <button
          type="submit"
          disabled={isSending || !draft.trim()}
          title="Send message"
          className="absolute bottom-3.5 right-2 flex h-9 w-9 items-center justify-center rounded-lg bg-[var(--accent-yellow)] text-[var(--navy-dark)] transition hover:brightness-105 disabled:cursor-not-allowed disabled:opacity-40"
        >
          {isSending ? (
            <span className="h-4 w-4 animate-spin rounded-full border-2 border-[var(--navy-dark)] border-t-transparent" />
          ) : (
            <SendIcon className="h-4 w-4" />
          )}
          <span className="sr-only">{isSending ? "Thinking..." : "Send message"}</span>
        </button>
      </form>
    </aside>
  );
};