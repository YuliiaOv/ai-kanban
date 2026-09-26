import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ChatSidebar } from "@/components/ChatSidebar";

const responseFor = (payload: unknown) => ({
  ok: true,
  status: 200,
  json: async () => payload,
});

describe("ChatSidebar", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("shows a text-only assistant response without refreshing the board", async () => {
    const refreshBoard = vi.fn<() => Promise<void>>().mockResolvedValue(undefined);
    const fetchMock = vi.fn().mockResolvedValue(
      responseFor({ message: "Keep the current focus.", operations: [], board_updated: false })
    );
    vi.stubGlobal("fetch", fetchMock);

    render(<ChatSidebar boardId="board-demo" onBoardUpdated={refreshBoard} />);
    await userEvent.type(screen.getByLabelText(/message the board assistant/i), "What should I focus on?");
    await userEvent.click(screen.getByRole("button", { name: /send message/i }));

    expect(await screen.findByText("Keep the current focus.")).toBeInTheDocument();
    expect(refreshBoard).not.toHaveBeenCalled();
    const body = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(body.message).toBe("What should I focus on?");
    // The current message is sent once, not repeated at the end of the history.
    expect(body.history.map((item: { content: string }) => item.content)).not.toContain(
      "What should I focus on?"
    );
  });

  it("refreshes the board after an AI mutation", async () => {
    const refreshBoard = vi.fn<() => Promise<void>>().mockResolvedValue(undefined);
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        responseFor({
          message: "I moved the card to Review.",
          operations: [{ type: "move", card_id: "card-1", column_id: "col-review", position: 0 }],
          board_updated: true,
        })
      )
    );

    render(<ChatSidebar boardId="board-demo" onBoardUpdated={refreshBoard} />);
    await userEvent.type(screen.getByLabelText(/message the board assistant/i), "Move card 1 to Review");
    await userEvent.click(screen.getByRole("button", { name: /send message/i }));

    await waitFor(() => expect(refreshBoard).toHaveBeenCalledTimes(1));
    expect(screen.getByText("I moved the card to Review.")).toBeInTheDocument();
  });

  it("posts to the chat endpoint of its board", async () => {
    const fetchMock = vi.fn().mockResolvedValue(responseFor({ message: "Hi.", board_updated: false }));
    vi.stubGlobal("fetch", fetchMock);

    render(<ChatSidebar boardId="board-42" onBoardUpdated={vi.fn()} />);
    await userEvent.type(screen.getByLabelText(/message the board assistant/i), "Hello");
    await userEvent.click(screen.getByRole("button", { name: /send message/i }));

    await screen.findByText("Hi.");
    expect(fetchMock.mock.calls[0][0]).toBe("/api/boards/board-42/chat");
  });

  it("shows the error and restores the draft when a turn fails", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({
        ok: false,
        status: 502,
        json: async () => ({ detail: "The AI service could not be reached." }),
      })
      .mockResolvedValueOnce(responseFor({ message: "Second try worked.", board_updated: false }));
    vi.stubGlobal("fetch", fetchMock);

    render(<ChatSidebar boardId="board-demo" onBoardUpdated={vi.fn()} />);
    const input = screen.getByLabelText(/message the board assistant/i);
    await userEvent.type(input, "Plan my week");
    await userEvent.click(screen.getByRole("button", { name: /send message/i }));

    expect(await screen.findByText("The AI service could not be reached.")).toBeInTheDocument();
    expect(input).toHaveValue("Plan my week");
    expect(screen.queryByText("Plan my week", { selector: "div" })).not.toBeInTheDocument();

    // The retry sends the same history as the first attempt: no dangling user turn.
    await userEvent.click(screen.getByRole("button", { name: /send message/i }));
    expect(await screen.findByText("Second try worked.")).toBeInTheDocument();
    const retryBody = JSON.parse(fetchMock.mock.calls[1][1].body);
    expect(retryBody.history).toHaveLength(1);
  });
});

