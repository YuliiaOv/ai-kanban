import {
  isOverdue,
  localDate,
  matchesFilter,
  moveCard,
  type Card,
  type Column,
} from "@/lib/kanban";

describe("moveCard", () => {
  const baseColumns: Column[] = [
    { id: "col-a", title: "A", cardIds: ["card-1", "card-2"] },
    { id: "col-b", title: "B", cardIds: ["card-3"] },
  ];

  it("reorders cards in the same column", () => {
    const result = moveCard(baseColumns, "card-2", "card-1");
    expect(result[0].cardIds).toEqual(["card-2", "card-1"]);
  });

  it("moves cards to another column", () => {
    const result = moveCard(baseColumns, "card-2", "card-3");
    expect(result[0].cardIds).toEqual(["card-1"]);
    expect(result[1].cardIds).toEqual(["card-2", "card-3"]);
  });

  it("drops cards to the end of a column", () => {
    const result = moveCard(baseColumns, "card-1", "col-b");
    expect(result[0].cardIds).toEqual(["card-2"]);
    expect(result[1].cardIds).toEqual(["card-3", "card-1"]);
  });
});

const card = (overrides: Partial<Card> = {}): Card => ({
  id: "card-1",
  title: "Write launch notes",
  details: "Cover pricing changes",
  priority: "none",
  due_date: null,
  ...overrides,
});

describe("matchesFilter", () => {
  it("matches everything with an empty filter", () => {
    expect(matchesFilter(card(), { query: "  ", priority: "all" })).toBe(true);
  });

  it("matches title or details case-insensitively", () => {
    expect(matchesFilter(card(), { query: "LAUNCH", priority: "all" })).toBe(true);
    expect(matchesFilter(card(), { query: "pricing", priority: "all" })).toBe(true);
    expect(matchesFilter(card(), { query: "roadmap", priority: "all" })).toBe(false);
  });

  it("combines the query with the priority", () => {
    const urgent = card({ priority: "high" });
    expect(matchesFilter(urgent, { query: "", priority: "high" })).toBe(true);
    expect(matchesFilter(urgent, { query: "", priority: "low" })).toBe(false);
    expect(matchesFilter(urgent, { query: "roadmap", priority: "high" })).toBe(false);
  });
});

describe("due dates", () => {
  it("formats the local calendar date", () => {
    expect(localDate(new Date(2026, 0, 5, 23, 30))).toBe("2026-01-05");
  });

  it("flags only past due dates as overdue", () => {
    expect(isOverdue(card({ due_date: "2026-03-09" }), "2026-03-10")).toBe(true);
    expect(isOverdue(card({ due_date: "2026-03-10" }), "2026-03-10")).toBe(false);
    expect(isOverdue(card({ due_date: null }), "2026-03-10")).toBe(false);
  });
});
