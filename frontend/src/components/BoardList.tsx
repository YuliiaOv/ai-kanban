import { FormEvent, useState } from "react";
import clsx from "clsx";
import type { BoardSummary } from "@/lib/kanban";
import { BoardIcon, PlusIcon } from "@/components/icons";

type BoardListProps = {
  boards: BoardSummary[];
  activeBoardId: string | null;
  onSelect: (boardId: string) => void;
  onCreate: (name: string) => Promise<void>;
};

export const BoardList = ({ boards, activeBoardId, onSelect, onCreate }: BoardListProps) => {
  const [isCreating, setIsCreating] = useState(false);
  const [name, setName] = useState("");

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!name.trim()) return;
    await onCreate(name.trim());
    setName("");
    setIsCreating(false);
  };

  return (
    <nav aria-label="Boards" className="flex flex-col gap-1">
      <p className="px-2 pb-1 text-xs font-semibold uppercase tracking-[0.24em] text-[var(--gray-text)]">
        Boards
      </p>
      {boards.map((board) => (
        <button
          key={board.id}
          type="button"
          onClick={() => onSelect(board.id)}
          aria-current={board.id === activeBoardId ? "page" : undefined}
          className={clsx(
            "flex items-center gap-2 rounded-lg px-2 py-2 text-left text-sm transition",
            board.id === activeBoardId
              ? "bg-[var(--navy-dark)] font-semibold text-white"
              : "text-[var(--navy-dark)] hover:bg-white"
          )}
        >
          <BoardIcon className="h-4 w-4 shrink-0" />
          <span className="min-w-0 flex-1 truncate">{board.name}</span>
          <span
            className={clsx(
              "shrink-0 text-xs",
              board.id === activeBoardId ? "text-white/70" : "text-[var(--gray-text)]"
            )}
            title={`${board.card_count} ${board.card_count === 1 ? "card" : "cards"}`}
          >
            {board.card_count}
          </span>
        </button>
      ))}
      {isCreating ? (
        <form onSubmit={handleSubmit} className="mt-2 space-y-2 px-1">
          <input
            value={name}
            onChange={(event) => setName(event.target.value)}
            placeholder="Board name"
            aria-label="New board name"
            maxLength={200}
            autoFocus
            className="w-full rounded-lg border border-[var(--stroke)] bg-white px-2.5 py-1.5 text-sm outline-none focus:border-[var(--primary-blue)]"
          />
          <div className="flex gap-2">
            <button
              type="submit"
              className="rounded-full bg-[var(--secondary-purple)] px-3 py-1 text-xs font-semibold text-white"
            >
              Create
            </button>
            <button
              type="button"
              onClick={() => {
                setIsCreating(false);
                setName("");
              }}
              className="rounded-full border border-[var(--stroke)] px-3 py-1 text-xs font-semibold text-[var(--gray-text)]"
            >
              Cancel
            </button>
          </div>
        </form>
      ) : (
        <button
          type="button"
          onClick={() => setIsCreating(true)}
          className="mt-1 flex items-center gap-2 rounded-lg px-2 py-2 text-sm font-semibold text-[var(--primary-blue)] transition hover:bg-white"
        >
          <PlusIcon className="h-4 w-4" />
          New board
        </button>
      )}
    </nav>
  );
};
