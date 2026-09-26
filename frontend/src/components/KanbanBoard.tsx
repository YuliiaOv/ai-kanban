"use client";

import { useEffect, useMemo, useState } from "react";
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  useSensor,
  useSensors,
  closestCorners,
  pointerWithin,
  type CollisionDetection,
  type DragEndEvent,
  type DragStartEvent,
} from "@dnd-kit/core";
import { KanbanColumn } from "@/components/KanbanColumn";
import { KanbanCardPreview } from "@/components/KanbanCardPreview";
import { ChatSidebar } from "@/components/ChatSidebar";
import { LogoutIcon } from "@/components/icons";
import { moveCard, type BoardData } from "@/lib/kanban";
import {
  createCard,
  deleteCard,
  fetchBoard,
  renameColumn,
  updateCard,
} from "@/lib/boardApi";

// closestCorners alone ranks a tall empty column below nearby cards in other columns,
// so prefer whatever is under the pointer and fall back to corners otherwise.
const collisionDetection: CollisionDetection = (args) => {
  const pointerCollisions = pointerWithin(args);
  return pointerCollisions.length > 0 ? pointerCollisions : closestCorners(args);
};

type KanbanBoardProps = {
  onLogout: () => void;
};

export const KanbanBoard = ({ onLogout }: KanbanBoardProps) => {
  const [board, setBoard] = useState<BoardData | null>(null);
  const [activeCardId, setActiveCardId] = useState<string | null>(null);
  const [error, setError] = useState("");

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: { distance: 6 },
    })
  );

  const cardsById = useMemo(() => board?.cards ?? {}, [board?.cards]);

  useEffect(() => {
    fetchBoard()
      .then((loadedBoard) => {
        setBoard(loadedBoard);
        setError("");
      })
      .catch(() => setError("Unable to load the board."));
  }, []);

  const refreshBoard = async () => {
    const loadedBoard = await fetchBoard();
    setBoard(loadedBoard);
    setError("");
  };

  const handleDragStart = (event: DragStartEvent) => {
    setActiveCardId(event.active.id as string);
  };

  const handleDragEnd = async (event: DragEndEvent) => {
    const { active, over } = event;
    setActiveCardId(null);

    if (!over || active.id === over.id || !board) {
      return;
    }

    const nextColumns = moveCard(board.columns, active.id as string, over.id as string);
    const nextBoard = { ...board, columns: nextColumns };
    const destination = nextColumns.find((column) =>
      column.cardIds.includes(active.id as string)
    );
    if (!destination) {
      return;
    }

    setBoard(nextBoard);
    try {
      await updateCard(active.id as string, {
        column_id: destination.id,
        position: destination.cardIds.indexOf(active.id as string),
      });
      await refreshBoard();
    } catch {
      setError("Unable to save the card move.");
      await refreshBoard().catch(() => undefined);
    }
  };

  const handleRenameColumn = (columnId: string, title: string) => {
    setBoard((prev) =>
      prev
        ? {
            ...prev,
            columns: prev.columns.map((column) =>
              column.id === columnId ? { ...column, title } : column
            ),
          }
        : prev
    );
  };

  const handleRenameColumnCommit = async (columnId: string, title: string) => {
    if (!title.trim()) {
      await refreshBoard().catch(() => setError("Unable to load the board."));
      return;
    }
    try {
      await renameColumn(columnId, title.trim());
      await refreshBoard();
    } catch {
      setError("Unable to save the column name.");
      await refreshBoard().catch(() => undefined);
    }
  };

  const handleAddCard = async (columnId: string, title: string, details: string) => {
    try {
      await createCard(columnId, title, details);
      await refreshBoard();
    } catch {
      setError("Unable to create the card.");
    }
  };

  const handleDeleteCard = async (cardId: string) => {
    try {
      await deleteCard(cardId);
      await refreshBoard();
    } catch {
      setError("Unable to delete the card.");
    }
  };

  const handleEditCard = async (cardId: string, title: string, details: string) => {
    try {
      await updateCard(cardId, { title, details });
      await refreshBoard();
    } catch {
      setError("Unable to save the card.");
    }
  };

  if (!board) {
    return (
      <main className="flex min-h-screen items-center justify-center px-6 py-10 text-sm text-[var(--gray-text)]">
        {error || "Loading board..."}
      </main>
    );
  }

  const activeCard = activeCardId ? cardsById[activeCardId] : null;

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
              <p className="text-xs text-[var(--gray-text)]">
                Drag cards between stages, rename columns, or ask the assistant.
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onLogout}
            className="flex items-center gap-2 rounded-full border border-[var(--stroke)] px-3 py-1.5 text-xs font-semibold text-[var(--navy-dark)] transition hover:border-[var(--primary-blue)] hover:text-[var(--primary-blue)]"
          >
            <LogoutIcon className="h-4 w-4" />
            Log out
          </button>
        </div>
      </header>

      {/* Chat sits beside the board only when there is room for five readable columns next to it. */}
      <main className="flex flex-1 flex-col gap-5 p-4 sm:px-6 min-[1400px]:flex-row min-[1400px]:items-start">
        <div className="flex min-w-0 flex-1 flex-col gap-4">
          {error ? (
            <p className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
              {error}
            </p>
          ) : null}
          <DndContext
            sensors={sensors}
            collisionDetection={collisionDetection}
            onDragStart={handleDragStart}
            onDragEnd={handleDragEnd}
          >
            <section className="flex gap-4 overflow-x-auto pb-2">
              {board.columns.map((column) => (
                <KanbanColumn
                  key={column.id}
                  column={column}
                  cards={column.cardIds.map((cardId) => board.cards[cardId])}
                  onRename={handleRenameColumn}
                  onRenameCommit={handleRenameColumnCommit}
                  onAddCard={handleAddCard}
                  onDeleteCard={handleDeleteCard}
                  onEditCard={handleEditCard}
                />
              ))}
            </section>
            <DragOverlay>
              {activeCard ? (
                <div className="w-[220px]">
                  <KanbanCardPreview card={activeCard} />
                </div>
              ) : null}
            </DragOverlay>
          </DndContext>
        </div>
        <div className="min-[1400px]:sticky min-[1400px]:top-[82px] min-[1400px]:w-[320px] min-[1400px]:shrink-0">
          <ChatSidebar onBoardUpdated={refreshBoard} />
        </div>
      </main>
    </div>
  );
};
