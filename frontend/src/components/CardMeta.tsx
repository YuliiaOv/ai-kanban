import clsx from "clsx";
import { isOverdue, type Card, type Priority } from "@/lib/kanban";
import { CalendarIcon } from "@/components/icons";

const PRIORITY_STYLES: Record<Exclude<Priority, "none">, string> = {
  high: "bg-[var(--secondary-purple)]/10 text-[var(--secondary-purple)]",
  medium: "bg-[var(--accent-yellow)]/15 text-[#8a6300]",
  low: "bg-[var(--primary-blue)]/10 text-[var(--primary-blue)]",
};

// Parse YYYY-MM-DD as a local calendar date so the label does not shift by timezone.
const formatDueDate = (value: string) => {
  const [year, month, day] = value.split("-").map(Number);
  return new Date(year, month - 1, day).toLocaleDateString("en-US", { month: "short", day: "numeric" });
};

export const CardMeta = ({ card }: { card: Card }) => {
  if (card.priority === "none" && !card.due_date) return null;
  const overdue = isOverdue(card);
  return (
    <div className="mt-2 flex flex-wrap items-center gap-1.5 text-[11px] font-semibold">
      {card.priority !== "none" ? (
        <span className={clsx("rounded-full px-2 py-0.5 capitalize", PRIORITY_STYLES[card.priority])}>
          {card.priority}
        </span>
      ) : null}
      {card.due_date ? (
        <span
          className={clsx(
            "flex items-center gap-1 rounded-full px-2 py-0.5",
            overdue ? "bg-red-50 text-red-600" : "bg-[var(--surface)] text-[var(--gray-text)]"
          )}
          title={overdue ? `Overdue (due ${card.due_date})` : `Due ${card.due_date}`}
        >
          <CalendarIcon className="h-3 w-3" />
          {formatDueDate(card.due_date)}
        </span>
      ) : null}
    </div>
  );
};
