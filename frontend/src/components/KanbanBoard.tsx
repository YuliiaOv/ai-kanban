"use client";

import { FormEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";
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
import { PlusIcon, SearchIcon, TrashIcon } from "@/components/icons";
import {
  PRIORITIES,
  matchesFilter,
  moveCard,
  type BoardData,
  type CardFilter,
  type Priority,
} from "@/lib/kanban";
import {
  createCard,
  createColumn,
  deleteBoard,
  deleteCard,
  deleteColumn,
  fetchBoard,
  updateBoard,
  updateCard,
  updateColumn,
  type CardPayload,
} from "@/lib/boardApi";

// closestCorners alone ranks a tall empty column below nearby cards in other columns,
// so prefer whatever is under the pointer and fall back to corners otherwise.
const collisionDetection: CollisionDetection = (args) => {
  const pointerCollisions = pointerWithin(args);
  return pointerCollisions.length > 0 ? pointerCollisions : closestCorners(args);
};

type KanbanBoardProps = {
  boardId: string;
  // Called after changes that affect the board list (name, card count, deletion).
  onBoardChanged: () => Promise<void>;
};

export const KanbanBoard = ({ boardId, onBoardChanged }: KanbanBoardProps) => {
  const [board, setBoard] = useState<BoardData | null>(null);
  const [activeCardId, setActiveCardId] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [filter, setFilter] = useState<CardFilter>({ query: "", priority: "all" });
  const [newColumnTitle, setNewColumnTitle] = useState("");
  // Only the latest fetch may update the board, so a slow earlier response cannot overwrite newer state.
  const latestFetch = useRef(0);

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: { distance: 6 },
    })
  );

  const cardsById = useMemo(() => board?.cards ?? {}, [board?.cards]);

  const refreshBoard = useCallback(() => {
    const fetchId = ++latestFetch.current;
    return fetchBoard(boardId).then((loadedBoard) => {
      if (fetchId === latestFetch.current) {
        setBoard(loadedBoard);
        setError("");
      }
    });
  }, [boardId]);

  useEffect(() => {
    refreshBoard().catch(() => setError("Unable to load the board."));
  }, [refreshBoard]);

  // Run a mutation, then reload the board (and the board list); on failure show the message and resync.
  const mutate = async (action: () => Promise<unknown>, failure: string, affectsList = false) => {
    try {
      await action();
      await refreshBoard();
      if (affectsList) await onBoardChanged();
    } catch {
      // Resync first: a successful refresh clears the error, so set it afterwards.
      await refreshBoard().catch(() => undefined);
      setError(failure);
    }
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

    const cardId = active.id as string;
    const nextColumns = moveCard(board.columns, cardId, over.id as string);
    const destination = nextColumns.find((column) => column.cardIds.includes(cardId));
    if (!destination) {
      return;
    }

    setBoard({ ...board, columns: nextColumns });
    await mutate(
      () =>
        updateCard(boardId, cardId, {
          column_id: destination.id,
          position: destination.cardIds.indexOf(cardId),
        }),
      "Unable to save the card move."
    );
  };

  const handleBoardFieldCommit = async (field: "name" | "description", input: HTMLInputElement) => {
    if (!board) return;
    const value = input.value.trim();
    if (value === board[field]) return;
    if (field === "name" && !value) {
      // The saved name is unchanged, so the keyed input would not remount; restore it directly.
      input.value = board.name;
      return;
    }
    await mutate(() => updateBoard(boardId, { [field]: value }), "Unable to save the board.", true);
  };

  const handleDeleteBoard = async () => {
    if (!board || !window.confirm(`Delete the board "${board.name}" and all of its cards?`)) return;
    try {
      await deleteBoard(boardId);
      await onBoardChanged();
    } catch {
      setError("Unable to delete the board.");
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
    await mutate(() => updateColumn(boardId, columnId, { title: title.trim() }), "Unable to save the column name.");
  };

  const handleMoveColumn = (columnId: string, position: number) =>
    mutate(() => updateColumn(boardId, columnId, { position }), "Unable to move the column.");

  const handleDeleteColumn = async (columnId: string) => {
    const column = board?.columns.find((item) => item.id === columnId);
    if (!column) return;
    const cardNote = column.cardIds.length ? ` and its ${column.cardIds.length} card(s)` : "";
    if (!window.confirm(`Delete the column "${column.title}"${cardNote}?`)) return;
    await mutate(() => deleteColumn(boardId, columnId), "Unable to delete the column.", true);
  };

  const handleAddColumn = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const title = newColumnTitle.trim();
    if (!title) return;
    setNewColumnTitle("");
    await mutate(() => createColumn(boardId, title), "Unable to add the column.");
  };

  const handleAddCard = (columnId: string, title: string, details: string) =>
    mutate(() => createCard(boardId, columnId, title, details), "Unable to create the card.", true);

  const handleDeleteCard = (cardId: string) =>
    mutate(() => deleteCard(boardId, cardId), "Unable to delete the card.", true);

  const handleEditCard = (cardId: string, payload: CardPayload) =>
    mutate(() => updateCard(boardId, cardId, payload), "Unable to save the card.");

  if (!board) {
    return (
      <main className="flex min-h-[50vh] items-center justify-center px-6 py-10 text-sm text-[var(--gray-text)]">
        {error || "Loading board..."}
      </main>
    );
  }

  const activeCard = activeCardId ? cardsById[activeCardId] : null;
  const isFiltering = filter.query.trim() !== "" || filter.priority !== "all";
  const totalCards = Object.keys(board.cards).length;
  const matchingCards = Object.values(board.cards).filter((card) => matchesFilter(card, filter)).length;

  return (
    <main className="flex flex-col gap-5 p-4 sm:px-6 min-[1400px]:flex-row min-[1400px]:items-start">
      <div className="flex min-w-0 flex-1 flex-col gap-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0 flex-1">
            {/* key resets the uncontrolled inputs whenever the saved values change. */}
            <input
              key={`name-${board.name}`}
              defaultValue={board.name}
              onBlur={(event) => handleBoardFieldCommit("name", event.currentTarget)}
              onKeyDown={(event) => event.key === "Enter" && event.currentTarget.blur()}
              aria-label="Board name"
              maxLength={200}
              className="w-full rounded-lg border border-transparent bg-transparent px-1.5 py-0.5 font-display text-2xl font-semibold text-[var(--navy-dark)] outline-none hover:border-[var(--stroke)] focus:border-[var(--primary-blue)]"
            />
            <input
              key={`description-${board.description}`}
              defaultValue={board.description}
              onBlur={(event) => handleBoardFieldCommit("description", event.currentTarget)}
              onKeyDown={(event) => event.key === "Enter" && event.currentTarget.blur()}
              aria-label="Board description"
              placeholder="Add a description"
              className="w-full rounded-lg border border-transparent bg-transparent px-1.5 py-0.5 text-sm text-[var(--gray-text)] outline-none hover:border-[var(--stroke)] focus:border-[var(--primary-blue)]"
            />
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <div className="relative">
              <SearchIcon className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--gray-text)]" />
              <input
                type="search"
                value={filter.query}
                onChange={(event) => setFilter((prev) => ({ ...prev, query: event.target.value }))}
                placeholder="Search cards"
                aria-label="Search cards"
                className="w-48 rounded-full border border-[var(--stroke)] bg-white py-1.5 pl-8 pr-3 text-sm outline-none focus:border-[var(--primary-blue)]"
              />
            </div>
            <select
              value={filter.priority}
              onChange={(event) =>
                setFilter((prev) => ({ ...prev, priority: event.target.value as Priority | "all" }))
              }
              aria-label="Filter by priority"
              className="rounded-full border border-[var(--stroke)] bg-white px-3 py-1.5 text-sm outline-none focus:border-[var(--primary-blue)]"
            >
              <option value="all">All priorities</option>
              {PRIORITIES.map((priority) => (
                <option key={priority} value={priority}>
                  {priority === "none" ? "No priority" : `${priority[0].toUpperCase()}${priority.slice(1)} priority`}
                </option>
              ))}
            </select>
            <button
              type="button"
              onClick={handleDeleteBoard}
              className="flex items-center gap-1.5 rounded-full border border-[var(--stroke)] px-3 py-1.5 text-xs font-semibold text-[var(--gray-text)] transition hover:border-red-300 hover:text-red-600"
            >
              <TrashIcon className="h-4 w-4" />
              Delete board
            </button>
          </div>
        </div>
        {isFiltering ? (
          <p className="text-xs text-[var(--gray-text)]" role="status">
            {matchingCards} of {totalCards} cards match.
          </p>
        ) : null}
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
            {board.columns.map((column, index) => (
              <KanbanColumn
                key={column.id}
                column={column}
                cards={column.cardIds.map((cardId) => board.cards[cardId])}
                filter={isFiltering ? filter : null}
                canMoveLeft={index > 0}
                canMoveRight={index < board.columns.length - 1}
                onRename={handleRenameColumn}
                onRenameCommit={handleRenameColumnCommit}
                onMove={(direction) => handleMoveColumn(column.id, index + direction)}
                onDelete={() => handleDeleteColumn(column.id)}
                onAddCard={handleAddCard}
                onDeleteCard={handleDeleteCard}
                onEditCard={handleEditCard}
              />
            ))}
            <form
              onSubmit={handleAddColumn}
              className="flex h-fit min-w-[180px] flex-col gap-2 rounded-2xl border border-dashed border-[var(--stroke)] p-3"
            >
              <input
                value={newColumnTitle}
                onChange={(event) => setNewColumnTitle(event.target.value)}
                placeholder="New column"
                aria-label="New column title"
                maxLength={200}
                className="rounded-lg border border-[var(--stroke)] bg-white px-2.5 py-1.5 text-sm outline-none focus:border-[var(--primary-blue)]"
              />
              <button
                type="submit"
                disabled={!newColumnTitle.trim()}
                className="flex items-center justify-center gap-1.5 rounded-full bg-[var(--secondary-purple)] px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-40"
              >
                <PlusIcon className="h-4 w-4" />
                Add column
              </button>
            </form>
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
        <ChatSidebar
          boardId={boardId}
          onBoardUpdated={async () => {
            await refreshBoard();
            await onBoardChanged();
          }}
        />
      </div>
    </main>
  );
};
