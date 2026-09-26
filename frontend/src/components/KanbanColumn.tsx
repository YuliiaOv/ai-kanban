import clsx from "clsx";
import { useDroppable } from "@dnd-kit/core";
import { SortableContext, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { matchesFilter, type Card, type CardFilter, type Column } from "@/lib/kanban";
import type { CardPayload } from "@/lib/boardApi";
import { KanbanCard } from "@/components/KanbanCard";
import { NewCardForm } from "@/components/NewCardForm";
import { ChevronLeftIcon, ChevronRightIcon, TrashIcon } from "@/components/icons";

type KanbanColumnProps = {
  column: Column;
  cards: Card[];
  // When set, cards that do not match are dimmed (kept in place so drag positions stay correct).
  filter: CardFilter | null;
  canMoveLeft: boolean;
  canMoveRight: boolean;
  onRename: (columnId: string, title: string) => void;
  onRenameCommit: (columnId: string, title: string) => void;
  onMove: (direction: -1 | 1) => void;
  onDelete: () => void;
  onAddCard: (columnId: string, title: string, details: string) => void;
  onDeleteCard: (cardId: string) => void;
  onEditCard: (cardId: string, payload: CardPayload) => void;
};

const iconButton =
  "rounded-md p-1 text-[var(--gray-text)] transition hover:bg-[var(--surface)] hover:text-[var(--primary-blue)] disabled:opacity-30 disabled:hover:bg-transparent";

export const KanbanColumn = ({
  column,
  cards,
  filter,
  canMoveLeft,
  canMoveRight,
  onRename,
  onRenameCommit,
  onMove,
  onDelete,
  onAddCard,
  onDeleteCard,
  onEditCard,
}: KanbanColumnProps) => {
  const { setNodeRef, isOver } = useDroppable({ id: column.id });

  return (
    <section
      ref={setNodeRef}
      className={clsx(
        "flex min-h-[420px] min-w-[200px] flex-1 min-[1400px]:min-h-[calc(100vh-180px)] basis-0 flex-col rounded-2xl border border-t-4 border-[var(--stroke)] border-t-[var(--accent-yellow)] bg-[var(--surface-strong)] p-3 shadow-[0_8px_24px_rgba(3,33,71,0.06)] transition",
        isOver && "ring-2 ring-[var(--accent-yellow)]"
      )}
      data-testid={`column-${column.id}`}
    >
      <div className="group/column flex items-center gap-1">
        <input
          value={column.title}
          onChange={(event) => onRename(column.id, event.target.value)}
          onBlur={(event) => onRenameCommit(column.id, event.target.value)}
          onKeyDown={(event) => event.key === "Enter" && event.currentTarget.blur()}
          className="min-w-0 flex-1 rounded-lg border border-transparent bg-transparent px-1.5 py-1 font-display text-base font-semibold text-[var(--navy-dark)] outline-none transition hover:border-[var(--stroke)] focus:border-[var(--primary-blue)]"
          aria-label="Column title"
          maxLength={200}
        />
        <span
          className="shrink-0 rounded-full bg-[var(--surface)] px-2 py-0.5 text-xs font-semibold text-[var(--gray-text)]"
          title={`${cards.length} ${cards.length === 1 ? "card" : "cards"}`}
        >
          {cards.length}
        </span>
      </div>
      <div className="mt-1 flex justify-end gap-0.5">
        <button
          type="button"
          onClick={() => onMove(-1)}
          disabled={!canMoveLeft}
          className={iconButton}
          aria-label={`Move ${column.title} left`}
          title="Move column left"
        >
          <ChevronLeftIcon className="h-4 w-4" />
        </button>
        <button
          type="button"
          onClick={() => onMove(1)}
          disabled={!canMoveRight}
          className={iconButton}
          aria-label={`Move ${column.title} right`}
          title="Move column right"
        >
          <ChevronRightIcon className="h-4 w-4" />
        </button>
        <button
          type="button"
          onClick={onDelete}
          className={clsx(iconButton, "hover:!text-red-600")}
          aria-label={`Delete column ${column.title}`}
          title="Delete column"
        >
          <TrashIcon className="h-4 w-4" />
        </button>
      </div>
      <div className="mt-2 flex flex-1 flex-col gap-2">
        <SortableContext items={column.cardIds} strategy={verticalListSortingStrategy}>
          {cards.map((card) => (
            <KanbanCard
              key={card.id}
              card={card}
              isDimmed={filter !== null && !matchesFilter(card, filter)}
              onDelete={onDeleteCard}
              onEdit={onEditCard}
            />
          ))}
        </SortableContext>
        {cards.length === 0 && (
          <div className="flex flex-1 items-center justify-center rounded-xl border border-dashed border-[var(--stroke)] px-3 py-6 text-center text-xs font-semibold uppercase tracking-[0.2em] text-[var(--gray-text)]">
            Drop a card here
          </div>
        )}
        <NewCardForm onAdd={(title, details) => onAddCard(column.id, title, details)} />
      </div>
    </section>
  );
};
