"use client";

import { useCallback, useEffect, useState } from "react";
import { AccountDialog } from "@/components/AccountDialog";
import { BoardList } from "@/components/BoardList";
import { KanbanBoard } from "@/components/KanbanBoard";
import { LogoutIcon, UserIcon } from "@/components/icons";
import type { User } from "@/lib/authApi";
import { createBoard, listBoards } from "@/lib/boardApi";
import type { BoardSummary } from "@/lib/kanban";

type WorkspaceProps = {
  user: User;
  onUserChange: (user: User) => void;
  onLogout: () => void;
  onSignedOut: () => void;
};

export const Workspace = ({ user, onUserChange, onLogout, onSignedOut }: WorkspaceProps) => {
  const [boards, setBoards] = useState<BoardSummary[] | null>(null);
  const [activeBoardId, setActiveBoardId] = useState<string | null>(null);
  const [isAccountOpen, setIsAccountOpen] = useState(false);
  const [error, setError] = useState("");

  const refreshBoards = useCallback(
    () =>
      listBoards()
        .then((loaded) => {
          setBoards(loaded);
          // Keep the current board if it still exists, otherwise fall back to the first one.
          setActiveBoardId((current) =>
            loaded.some((board) => board.id === current) ? current : (loaded[0]?.id ?? null)
          );
          setError("");
        })
        .catch(() => setError("Unable to load your boards.")),
    []
  );

  useEffect(() => {
    refreshBoards();
  }, [refreshBoards]);

  const handleCreateBoard = async (name: string) => {
    try {
      const board = await createBoard(name);
      setActiveBoardId(board.id);
      await refreshBoards();
    } catch {
      setError("Unable to create the board.");
    }
  };

  return (
    <div className="flex min-h-screen flex-col">
      <header className="sticky top-0 z-20 border-b border-[var(--stroke)] bg-white/90 backdrop-blur">
        <div className="flex items-center justify-between gap-4 px-4 py-3 sm:px-6">
          <div className="flex items-center gap-3">
            <span className="h-8 w-1.5 rounded-full bg-[var(--accent-yellow)]" />
            <div>
              <h1 className="font-display text-xl font-semibold leading-tight text-[var(--navy-dark)]">
                Kanban Studio
              </h1>
              <p className="text-xs text-[var(--gray-text)]">Plan every project on its own board.</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setIsAccountOpen(true)}
              className="flex items-center gap-2 rounded-full border border-[var(--stroke)] px-3 py-1.5 text-xs font-semibold text-[var(--navy-dark)] transition hover:border-[var(--primary-blue)] hover:text-[var(--primary-blue)]"
              aria-label="Account settings"
            >
              <UserIcon className="h-4 w-4" />
              <span>{user.display_name}</span>
            </button>
            <button
              type="button"
              onClick={onLogout}
              className="flex items-center gap-2 rounded-full border border-[var(--stroke)] px-3 py-1.5 text-xs font-semibold text-[var(--navy-dark)] transition hover:border-[var(--primary-blue)] hover:text-[var(--primary-blue)]"
            >
              <LogoutIcon className="h-4 w-4" />
              Log out
            </button>
          </div>
        </div>
      </header>

      <div className="flex flex-1 flex-col md:flex-row">
        <aside className="border-b border-[var(--stroke)] p-3 md:w-56 md:shrink-0 md:border-b-0 md:border-r">
          {boards ? (
            <BoardList
              boards={boards}
              activeBoardId={activeBoardId}
              onSelect={setActiveBoardId}
              onCreate={handleCreateBoard}
            />
          ) : null}
        </aside>
        <div className="min-w-0 flex-1">
          {error ? (
            <p className="m-4 rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>
          ) : null}
          {activeBoardId ? (
            <KanbanBoard
              key={activeBoardId}
              boardId={activeBoardId}
              onBoardChanged={refreshBoards}
            />
          ) : boards ? (
            <div className="flex h-full items-center justify-center p-10 text-center text-sm text-[var(--gray-text)]">
              You have no boards yet. Use &quot;New board&quot; to create one.
            </div>
          ) : (
            <p className="p-10 text-center text-sm text-[var(--gray-text)]">Loading boards...</p>
          )}
        </div>
      </div>

      {isAccountOpen ? (
        <AccountDialog
          user={user}
          onClose={() => setIsAccountOpen(false)}
          onUserChange={onUserChange}
          onAccountDeleted={onSignedOut}
        />
      ) : null}
    </div>
  );
};
