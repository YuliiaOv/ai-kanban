"use client";

import { FormEvent, useState } from "react";
import { sendChatMessage, type ChatMessage } from "@/lib/chatApi";

type ChatSidebarProps = {
  onBoardUpdated: () => Promise<void>;
};

export const ChatSidebar = ({ onBoardUpdated }: ChatSidebarProps) => {
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
      const response = await sendChatMessage(message, messages);
      setMessages((current) => [...current, { role: "assistant", content: response.message }]);
      if (response.board_updated) {
        await onBoardUpdated();
      }
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Unable to send the message.");
    } finally {
      setIsSending(false);
    }
  };

  return (
    <aside className="flex min-h-[520px] flex-col rounded-[28px] border border-[var(--stroke)] bg-[var(--navy-dark)] p-5 text-white shadow-[var(--shadow)] lg:sticky lg:top-6 lg:h-[calc(100vh-48px)]">
      <div className="border-b border-white/15 pb-5">
        <p className="text-xs font-semibold uppercase tracking-[0.28em] text-[var(--accent-yellow)]">
          Board assistant
        </p>
        <h2 className="mt-2 font-display text-2xl font-semibold">Make a move</h2>
        <p className="mt-2 text-sm leading-6 text-white/60">Create, refine, move, or clear cards with a short request.</p>
      </div>

      <div className="flex-1 space-y-4 overflow-y-auto py-5" aria-live="polite">
        {messages.map((message, index) => (
          <div
            key={`${message.role}-${index}`}
            className={`max-w-[92%] rounded-2xl px-4 py-3 text-sm leading-6 ${
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

      <form onSubmit={handleSubmit} className="border-t border-white/15 pt-5">
        <label htmlFor="chat-message" className="sr-only">Message the board assistant</label>
        <textarea
          id="chat-message"
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          placeholder="Try: Move QA micro-interactions to Done"
          rows={3}
          className="w-full resize-none rounded-2xl border border-white/15 bg-white/10 px-4 py-3 text-sm text-white outline-none placeholder:text-white/45 focus:border-[var(--accent-yellow)]"
          disabled={isSending}
        />
        <button
          type="submit"
          disabled={isSending || !draft.trim()}
          className="mt-3 flex w-full items-center justify-center gap-2 rounded-full bg-[var(--accent-yellow)] px-4 py-3 text-sm font-semibold text-[var(--navy-dark)] transition hover:brightness-105 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {isSending ? "Thinking..." : "Send message"}
        </button>
      </form>
    </aside>
  );
};