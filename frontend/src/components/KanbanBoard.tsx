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

export const KanbanBoard = () => {
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
    <div className="relative overflow-hidden">
      <div className="pointer-events-none absolute left-0 top-0 h-[420px] w-[420px] -translate-x-1/3 -translate-y-1/3 rounded-full bg-[radial-gradient(circle,_rgba(32,157,215,0.25)_0%,_rgba(32,157,215,0.05)_55%,_transparent_70%)]" />
      <div className="pointer-events-none absolute bottom-0 right-0 h-[520px] w-[520px] translate-x-1/4 translate-y-1/4 rounded-full bg-[radial-gradient(circle,_rgba(117,57,145,0.18)_0%,_rgba(117,57,145,0.05)_55%,_transparent_75%)]" />

      <main className="relative mx-auto grid min-h-screen max-w-[1700px] gap-8 px-6 pb-16 pt-12 lg:grid-cols-[minmax(0,1fr)_340px]">
        <div className="flex min-w-0 flex-col gap-10">
        <header className="flex flex-col gap-6 rounded-[32px] border border-[var(--stroke)] bg-white/80 p-8 shadow-[var(--shadow)] backdrop-blur">
          {error ? (
            <p className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
              {error}
            </p>
          ) : null}
          <div className="flex flex-wrap items-start justify-between gap-6">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.35em] text-[var(--gray-text)]">
                Single Board Kanban
              </p>
              <h1 className="mt-3 font-display text-4xl font-semibold text-[var(--navy-dark)]">
                Kanban Studio
              </h1>
              <p className="mt-3 max-w-xl text-sm leading-6 text-[var(--gray-text)]">
                Keep momentum visible. Rename columns, drag cards between stages,
                and capture quick notes without getting buried in settings.
              </p>
            </div>
            <div className="rounded-2xl border border-[var(--stroke)] bg-[var(--surface)] px-5 py-4">
              <p className="text-xs font-semibold uppercase tracking-[0.25em] text-[var(--gray-text)]">
                Focus
              </p>
              <p className="mt-2 text-lg font-semibold text-[var(--primary-blue)]">
                One board. Five columns. Zero clutter.
              </p>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-4">
            {board.columns.map((column) => (
              <div
                key={column.id}
                className="flex items-center gap-2 rounded-full border border-[var(--stroke)] px-4 py-2 text-xs font-semibold uppercase tracking-[0.2em] text-[var(--navy-dark)]"
              >
                <span className="h-2 w-2 rounded-full bg-[var(--accent-yellow)]" />
                {column.title}
              </div>
            ))}
          </div>
        </header>

        <DndContext
          sensors={sensors}
          collisionDetection={collisionDetection}
          onDragStart={handleDragStart}
          onDragEnd={handleDragEnd}
        >
          <section className="grid gap-6 lg:grid-cols-5">
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
              <div className="w-[260px]">
                <KanbanCardPreview card={activeCard} />
              </div>
            ) : null}
          </DragOverlay>
        </DndContext>
        </div>
        <div className="order-first lg:order-last">
          <ChatSidebar onBoardUpdated={refreshBoard} />
        </div>
      </main>
    </div>
  );
};
