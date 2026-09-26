import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, vi } from "vitest";
import { KanbanBoard } from "@/components/KanbanBoard";
import { installFakeApi, type FakeApi } from "@/test/fakeApi";

let api: FakeApi;
let onBoardChanged: ReturnType<typeof vi.fn<() => Promise<void>>>;

beforeEach(() => {
  api = installFakeApi();
  onBoardChanged = vi.fn<() => Promise<void>>().mockResolvedValue(undefined);
});

const renderBoard = async () => {
  render(<KanbanBoard boardId="board-demo" onBoardChanged={onBoardChanged} />);
  await waitFor(() => expect(screen.getAllByTestId(/^column-/)).toHaveLength(5));
};

const column = (id: string) => screen.getByTestId(`column-${id}`);
const columnTitles = () => screen.getAllByLabelText("Column title").map((input) => (input as HTMLInputElement).value);

describe("KanbanBoard", () => {
  it("renders the board name, description, and columns", async () => {
    await renderBoard();

    expect(screen.getByLabelText("Board name")).toHaveValue("Project Board");
    expect(screen.getByLabelText("Board description")).toHaveValue("The demo product launch board.");
    expect(columnTitles()).toEqual(["Backlog", "Discovery", "In Progress", "Review", "Done"]);
  });

  it("shows the load error when the board is missing", async () => {
    render(<KanbanBoard boardId="missing" onBoardChanged={onBoardChanged} />);

    expect(await screen.findByText("Unable to load the board.")).toBeInTheDocument();
  });

  it("renames a column and saves it on blur", async () => {
    await renderBoard();
    const input = within(column("col-backlog")).getByLabelText("Column title");
    await userEvent.clear(input);
    await userEvent.type(input, "Ideas{Enter}");

    await waitFor(() => expect(api.board().columns[0].title).toBe("Ideas"));
    expect(input).toHaveValue("Ideas");
  });

  it("restores the saved column title when it is cleared", async () => {
    await renderBoard();
    const input = within(column("col-backlog")).getByLabelText("Column title");
    await userEvent.clear(input);
    input.blur();

    await waitFor(() => expect(input).toHaveValue("Backlog"));
    expect(api.requests("PATCH", /\/columns\//)).toHaveLength(0);
  });

  it("adds and removes a card and tells the workspace", async () => {
    await renderBoard();
    const backlog = column("col-backlog");
    await userEvent.click(within(backlog).getByRole("button", { name: /add a card/i }));
    await userEvent.type(within(backlog).getByPlaceholderText(/card title/i), "New card");
    await userEvent.type(within(backlog).getByPlaceholderText(/details/i), "Notes");
    await userEvent.click(within(backlog).getByRole("button", { name: /add card/i }));

    expect(await within(backlog).findByText("New card")).toBeInTheDocument();
    expect(onBoardChanged).toHaveBeenCalledTimes(1);

    await userEvent.click(within(backlog).getByRole("button", { name: /delete new card/i }));
    await waitFor(() => expect(within(backlog).queryByText("New card")).not.toBeInTheDocument());
    expect(onBoardChanged).toHaveBeenCalledTimes(2);
  });

  it("edits a card's title, priority, and due date", async () => {
    await renderBoard();
    const card = screen.getByTestId("card-card-2");

    await userEvent.click(within(card).getByRole("button", { name: /edit/i }));
    // The sortable role="button" and aria-disabled would make the form read as disabled.
    expect(card).not.toHaveAttribute("role");
    expect(card).not.toHaveAttribute("aria-disabled");
    const titleInput = within(card).getByRole("textbox", { name: /edit .* title/i });
    await userEvent.clear(titleInput);
    await userEvent.type(titleInput, "Updated signals");
    await userEvent.selectOptions(within(card).getByLabelText(/priority/i), "medium");
    await userEvent.type(within(card).getByLabelText(/due date/i), "2030-05-17");
    await userEvent.click(within(card).getByRole("button", { name: /save/i }));

    expect(await within(card).findByText("Updated signals")).toBeInTheDocument();
    expect(within(card).getByText("medium")).toBeInTheDocument();
    expect(within(card).getByText("May 17")).toBeInTheDocument();
    expect(api.requests("PATCH", /cards\/card-2$/).at(-1)).toEqual({
      title: "Updated signals",
      details: "Review support tags, sales notes, and churn feedback.",
      priority: "medium",
      due_date: "2030-05-17",
    });
  });

  it("clears a due date and flags overdue cards", async () => {
    api.board().cards["card-2"].due_date = "2020-01-01";
    await renderBoard();
    const card = screen.getByTestId("card-card-2");
    expect(within(card).getByTitle("Overdue (due 2020-01-01)")).toBeInTheDocument();

    await userEvent.click(within(card).getByRole("button", { name: /edit/i }));
    await userEvent.clear(within(card).getByLabelText(/due date/i));
    await userEvent.click(within(card).getByRole("button", { name: /save/i }));

    await waitFor(() => expect(within(card).queryByTitle(/due/i)).not.toBeInTheDocument());
    expect(api.board().cards["card-2"].due_date).toBeNull();
  });

  it("opens the edit form with the latest card values after a refresh", async () => {
    await renderBoard();
    const card = screen.getByTestId("card-card-1");

    // Open and cancel once, so the card has mounted with its original values.
    await userEvent.click(within(card).getByRole("button", { name: /edit/i }));
    await userEvent.click(within(card).getByRole("button", { name: /cancel/i }));

    // The card changes elsewhere (e.g. by the AI); any board refresh picks it up.
    api.board().cards["card-1"].title = "Changed by AI";
    const columnTitle = within(column("col-backlog")).getByLabelText("Column title");
    await userEvent.type(columnTitle, "!");
    columnTitle.blur();
    await waitFor(() => expect(within(card).getByText("Changed by AI")).toBeInTheDocument());

    await userEvent.click(within(card).getByRole("button", { name: /edit/i }));
    expect(within(card).getByRole("textbox", { name: /edit .* title/i })).toHaveValue("Changed by AI");
  });

  it("renames the board and updates its description", async () => {
    await renderBoard();
    const name = screen.getByLabelText("Board name");
    await userEvent.clear(name);
    await userEvent.type(name, "Launch plan{Enter}");
    await waitFor(() => expect(api.board().name).toBe("Launch plan"));
    expect(onBoardChanged).toHaveBeenCalled();

    const description = screen.getByLabelText("Board description");
    await userEvent.clear(description);
    await userEvent.type(description, "Everything for launch day");
    description.blur();
    await waitFor(() => expect(api.board().description).toBe("Everything for launch day"));
  });

  it("does not save an empty board name", async () => {
    await renderBoard();
    const name = screen.getByLabelText("Board name");
    await userEvent.clear(name);
    name.blur();

    await waitFor(() => expect(screen.getByLabelText("Board name")).toHaveValue("Project Board"));
    expect(api.requests("PATCH", /boards\/board-demo$/)).toHaveLength(0);
  });

  it("adds, moves, and deletes columns", async () => {
    const confirm = vi.spyOn(window, "confirm").mockReturnValue(true);
    await renderBoard();

    expect(screen.getByRole("button", { name: "Add column" })).toBeDisabled();
    await userEvent.type(screen.getByLabelText("New column title"), "Blocked");
    await userEvent.click(screen.getByRole("button", { name: "Add column" }));
    await waitFor(() => expect(columnTitles()).toHaveLength(6));
    expect(columnTitles().at(-1)).toBe("Blocked");
    expect(screen.getByLabelText("New column title")).toHaveValue("");

    expect(screen.getByRole("button", { name: "Move Backlog left" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Move Blocked right" })).toBeDisabled();
    await userEvent.click(screen.getByRole("button", { name: "Move Backlog right" }));
    await waitFor(() => expect(columnTitles().slice(0, 2)).toEqual(["Discovery", "Backlog"]));
    await userEvent.click(screen.getByRole("button", { name: "Move Blocked left" }));
    await waitFor(() => expect(columnTitles().slice(-2)).toEqual(["Blocked", "Done"]));

    await userEvent.click(screen.getByRole("button", { name: "Delete column Backlog" }));
    expect(confirm).toHaveBeenCalledWith('Delete the column "Backlog" and its 2 card(s)?');
    await waitFor(() => expect(columnTitles()).not.toContain("Backlog"));
    expect(api.board().cards["card-1"]).toBeUndefined();
  });

  it("keeps a column when deletion is not confirmed", async () => {
    vi.spyOn(window, "confirm").mockReturnValue(false);
    await renderBoard();

    await userEvent.click(screen.getByRole("button", { name: "Delete column Review" }));

    expect(columnTitles()).toContain("Review");
    expect(api.requests("DELETE", /columns/)).toHaveLength(0);
  });

  it("dims cards that do not match the search or priority filter", async () => {
    await renderBoard();

    await userEvent.type(screen.getByLabelText("Search cards"), "roadmap");
    expect(screen.getByText("1 of 8 cards match.")).toBeInTheDocument();
    expect(screen.getByTestId("card-card-1")).not.toHaveAttribute("data-dimmed");
    expect(screen.getByTestId("card-card-2")).toHaveAttribute("data-dimmed");

    await userEvent.clear(screen.getByLabelText("Search cards"));
    await userEvent.selectOptions(screen.getByLabelText("Filter by priority"), "medium");
    expect(screen.getByText("1 of 8 cards match.")).toBeInTheDocument();
    expect(screen.getByTestId("card-card-3")).not.toHaveAttribute("data-dimmed");
    expect(screen.getByTestId("card-card-1")).toHaveAttribute("data-dimmed");

    await userEvent.selectOptions(screen.getByLabelText("Filter by priority"), "all");
    expect(screen.queryByText(/cards match/)).not.toBeInTheDocument();
    expect(screen.getByTestId("card-card-1")).not.toHaveAttribute("data-dimmed");
  });

  it("deletes the board after confirmation", async () => {
    const confirm = vi.spyOn(window, "confirm").mockReturnValueOnce(false).mockReturnValueOnce(true);
    await renderBoard();

    await userEvent.click(screen.getByRole("button", { name: /delete board/i }));
    expect(api.state.boards).toHaveLength(1);

    await userEvent.click(screen.getByRole("button", { name: /delete board/i }));
    expect(confirm).toHaveBeenLastCalledWith('Delete the board "Project Board" and all of its cards?');
    await waitFor(() => expect(api.state.boards).toHaveLength(0));
    expect(onBoardChanged).toHaveBeenCalled();
  });

  it("shows an error and resyncs when a change fails", async () => {
    await renderBoard();
    // The card was removed elsewhere, so the delete returns 404.
    delete api.board().cards["card-6"];
    api.board().columns[3].cardIds = [];

    await userEvent.click(screen.getByRole("button", { name: /delete qa micro-interactions/i }));

    expect(await screen.findByText("Unable to delete the card.")).toBeInTheDocument();
    await waitFor(() => expect(screen.queryByTestId("card-card-6")).not.toBeInTheDocument());
  });
});
