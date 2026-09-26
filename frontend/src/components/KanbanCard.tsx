import { useState } from "react";
import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import clsx from "clsx";
import { PRIORITIES, type Card, type Priority } from "@/lib/kanban";
import type { CardPayload } from "@/lib/boardApi";
import { CardMeta } from "@/components/CardMeta";
import { PencilIcon, TrashIcon } from "@/components/icons";

type KanbanCardProps = {
  card: Card;
  isDimmed?: boolean;
  onDelete: (cardId: string) => void;
  onEdit: (cardId: string, payload: CardPayload) => void;
};

const fieldClass =
  "w-full rounded-lg border border-[var(--stroke)] px-2.5 py-1.5 outline-none focus:border-[var(--primary-blue)]";

export const KanbanCard = ({ card, isDimmed = false, onDelete, onEdit }: KanbanCardProps) => {
  const [isEditing, setIsEditing] = useState(false);
  const [draft, setDraft] = useState(card);

  // Load the draft from the current card each time, so edits made elsewhere (e.g. by the AI) are not reverted.
  const startEditing = () => {
    setDraft(card);
    setIsEditing(true);
  };
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: card.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  return (
    <article
      ref={setNodeRef}
      style={style}
      className={clsx(
        "group relative rounded-xl border border-[var(--stroke)] bg-white p-3 shadow-[0_4px_12px_rgba(3,33,71,0.06)]",
        "transition-all duration-150",
        "hover:border-[var(--primary-blue)]/40",
        isDragging && "opacity-60 shadow-[0_18px_32px_rgba(3,33,71,0.16)]",
        isDimmed && "opacity-30"
      )}
      // No drag handlers while editing, so selecting text in the form does not start a drag.
      {...(isEditing ? {} : { ...attributes, ...listeners })}
      data-testid={`card-${card.id}`}
      data-dimmed={isDimmed || undefined}
    >
      {isEditing ? (
        <form
          className="space-y-2"
          onSubmit={(event) => {
            event.preventDefault();
            if (!draft.title.trim()) return;
            onEdit(card.id, {
              title: draft.title.trim(),
              details: draft.details.trim(),
              priority: draft.priority,
              due_date: draft.due_date || null,
            });
            setIsEditing(false);
          }}
        >
          <input
            value={draft.title}
            onChange={(event) => setDraft({ ...draft, title: event.target.value })}
            aria-label={`Edit ${card.title} title`}
            maxLength={200}
            className={`${fieldClass} text-sm font-semibold text-[var(--navy-dark)]`}
          />
          <textarea
            value={draft.details}
            onChange={(event) => setDraft({ ...draft, details: event.target.value })}
            aria-label={`Edit ${card.title} details`}
            rows={3}
            maxLength={5000}
            className={`${fieldClass} resize-none text-xs leading-5 text-[var(--gray-text)]`}
          />
          <div className="flex gap-2">
            <select
              value={draft.priority}
              onChange={(event) => setDraft({ ...draft, priority: event.target.value as Priority })}
              aria-label={`Edit ${card.title} priority`}
              className={`${fieldClass} text-xs`}
            >
              {PRIORITIES.map((priority) => (
                <option key={priority} value={priority}>
                  {priority === "none" ? "No priority" : priority}
                </option>
              ))}
            </select>
            <input
              type="date"
              value={draft.due_date ?? ""}
              onChange={(event) => setDraft({ ...draft, due_date: event.target.value || null })}
              aria-label={`Edit ${card.title} due date`}
              className={`${fieldClass} text-xs`}
            />
          </div>
          <div className="flex gap-2">
            <button type="submit" className="rounded-full bg-[var(--secondary-purple)] px-3 py-1 text-xs font-semibold text-white">
              Save
            </button>
            <button type="button" onClick={() => setIsEditing(false)} className="rounded-full border border-[var(--stroke)] px-3 py-1 text-xs font-semibold text-[var(--gray-text)]">
              Cancel
            </button>
          </div>
        </form>
      ) : (
        <>
          <h4 className="break-words font-display text-sm font-semibold leading-5 text-[var(--navy-dark)]">
            {card.title}
          </h4>
          {card.details ? (
            <p className="mt-1 break-words text-xs leading-5 text-[var(--gray-text)]">{card.details}</p>
          ) : null}
          <CardMeta card={card} />
          {/* Overlay the actions on hover or focus so the title can use the full card width; always shown on touch screens. */}
          <div className="absolute right-1.5 top-1.5 flex rounded-lg border border-[var(--stroke)] bg-white opacity-0 shadow-sm transition group-hover:opacity-100 group-focus-within:opacity-100 pointer-coarse:opacity-100">
            <button
              type="button"
              onClick={startEditing}
              className="rounded-md p-1.5 text-[var(--gray-text)] transition hover:bg-[var(--surface)] hover:text-[var(--primary-blue)]"
              aria-label={`Edit ${card.title}`}
              title="Edit card"
            >
              <PencilIcon className="h-4 w-4" />
            </button>
            <button
              type="button"
              onClick={() => onDelete(card.id)}
              className="rounded-md p-1.5 text-[var(--gray-text)] transition hover:bg-red-50 hover:text-red-600"
              aria-label={`Delete ${card.title}`}
              title="Delete card"
            >
              <TrashIcon className="h-4 w-4" />
            </button>
          </div>
        </>
      )}
    </article>
  );
};
