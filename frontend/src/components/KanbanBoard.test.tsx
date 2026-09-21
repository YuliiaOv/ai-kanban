import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, vi } from "vitest";
import { KanbanBoard } from "@/components/KanbanBoard";
import { initialData, type BoardData } from "@/lib/kanban";

let serverBoard: BoardData;

const cloneBoard = (board: BoardData): BoardData => structuredClone(board);

beforeEach(() => {
  serverBoard = cloneBoard(initialData);
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL, options?: RequestInit) => {
      const url = input.toString();
      const method = options?.method ?? "GET";
      const body = options?.body ? JSON.parse(options.body.toString()) : undefined;

      if (url === "/api/board" && method === "GET") {
        return { ok: true, status: 200, json: async () => cloneBoard(serverBoard) };
      }
      if (url.includes("/columns/") && method === "PATCH") {
        const columnId = url.split("/").pop();
        const column = serverBoard.columns.find((item) => item.id === columnId);
        if (column) column.title = body.title;
        return { ok: true, status: 200, json: async () => ({ status: "updated" }) };
      }
      if (url === "/api/board/cards" && method === "POST") {
        const id = "card-test-created";
        serverBoard.cards[id] = { id, title: body.title, details: body.details };
        serverBoard.columns[0].cardIds.push(id);
        return { ok: true, status: 201, json: async () => ({ id }) };
      }
      if (url.includes("/cards/") && method === "DELETE") {
        const cardId = url.split("/").pop() as string;
        delete serverBoard.cards[cardId];
        serverBoard.columns.forEach((column) => {
          column.cardIds = column.cardIds.filter((id) => id !== cardId);
        });
        return { ok: true, status: 200, json: async () => ({ status: "deleted" }) };
      }
      if (url.includes("/cards/") && method === "PATCH") {
        const cardId = url.split("/").pop() as string;
        const card = serverBoard.cards[cardId];
        if (card) {
          card.title = body.title ?? card.title;
          card.details = body.details ?? card.details;
        }
        return { ok: true, status: 200, json: async () => ({ status: "updated" }) };
      }
      return { ok: true, status: 200, json: async () => ({ status: "updated" }) };
    })
  );
});

const getFirstColumn = () => screen.getAllByTestId(/column-/i)[0];

describe("KanbanBoard", () => {
  it("renders five columns", () => {
    render(<KanbanBoard />);
    return waitFor(() =>
      expect(screen.getAllByTestId(/column-/i)).toHaveLength(5)
    );
  });

  it("renames a column", async () => {
    render(<KanbanBoard />);
    await waitFor(() => expect(screen.getAllByTestId(/column-/i)).toHaveLength(5));
    const column = getFirstColumn();
    const input = within(column).getByLabelText("Column title");
    await userEvent.clear(input);
    await userEvent.type(input, "New Name");
    expect(input).toHaveValue("New Name");
  });

  it("adds and removes a card", async () => {
    render(<KanbanBoard />);
    await waitFor(() => expect(screen.getAllByTestId(/column-/i)).toHaveLength(5));
    const column = getFirstColumn();
    const addButton = within(column).getByRole("button", {
      name: /add a card/i,
    });
    await userEvent.click(addButton);

    const titleInput = within(column).getByPlaceholderText(/card title/i);
    await userEvent.type(titleInput, "New card");
    const detailsInput = within(column).getByPlaceholderText(/details/i);
    await userEvent.type(detailsInput, "Notes");

    await userEvent.click(within(column).getByRole("button", { name: /add card/i }));

    await waitFor(() => expect(within(column).getByText("New card")).toBeInTheDocument());

    const deleteButton = within(column).getByRole("button", {
      name: /delete new card/i,
    });
    await userEvent.click(deleteButton);

    await waitFor(() =>
      expect(within(column).queryByText("New card")).not.toBeInTheDocument()
    );
  });

  it("edits a card and refreshes from the backend", async () => {
    render(<KanbanBoard />);
    await waitFor(() => expect(screen.getAllByTestId(/column-/i)).toHaveLength(5));
    const column = getFirstColumn();
    const card = within(column).getByTestId("card-card-1");

    await userEvent.click(within(card).getByRole("button", { name: /edit/i }));
    const titleInput = within(card).getByRole("textbox", { name: /edit .* title/i });
    await userEvent.clear(titleInput);
    await userEvent.type(titleInput, "Updated roadmap themes");
    await userEvent.click(within(card).getByRole("button", { name: /save/i }));

    await waitFor(() =>
      expect(within(column).getByText("Updated roadmap themes")).toBeInTheDocument()
    );
  });
});
