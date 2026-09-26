import { vi } from "vitest";
import type { User } from "@/lib/authApi";
import type { BoardData, Card } from "@/lib/kanban";
import { initialData } from "@/test/boardFixture";

type Account = { user: User; password: string };
type ChatHandler = (body: { message: string; history: unknown[] }, board: BoardData) => {
  status?: number;
  body: unknown;
};

export type FakeApi = ReturnType<typeof installFakeApi>;

const respond = (status: number, body: unknown) => ({
  ok: status < 400,
  status,
  json: async () => structuredClone(body),
});

const DEMO_USER: User = { id: "user-demo", username: "user", display_name: "Demo User" };

/**
 * Stub global fetch with an in-memory version of the backend API, so components run their real request flows.
 * Starts with the demo account (user / password) owning one board built from the shared fixture.
 */
export const installFakeApi = ({ signedIn = true }: { signedIn?: boolean } = {}) => {
  const accounts: Account[] = [{ user: { ...DEMO_USER }, password: "password" }];
  const state = {
    currentUser: signedIn ? accounts[0].user : (null as User | null),
    boards: [structuredClone(initialData)] as BoardData[],
    owners: { [initialData.id]: DEMO_USER.id } as Record<string, string>,
    chat: ((): ReturnType<ChatHandler> => ({
      body: { message: "Noted.", operations: [], board_updated: false },
    })) as ChatHandler,
    nextId: 1,
  };

  const newId = (prefix: string) => `${prefix}-fake-${state.nextId++}`;
  const findBoard = (boardId: string) =>
    state.boards.find((board) => board.id === boardId && state.owners[board.id] === state.currentUser?.id);
  const columnOf = (board: BoardData, cardId: string) =>
    board.columns.find((column) => column.cardIds.includes(cardId));
  const newBoard = (name: string, description = "") => {
    const board = {
      id: newId("board"),
      name,
      description,
      columns: ["Backlog", "Discovery", "In Progress", "Review", "Done"].map((title) => ({
        id: newId("col"),
        title,
        cardIds: [] as string[],
      })),
      cards: {} as Record<string, Card>,
    };
    state.boards.push(board);
    state.owners[board.id] = state.currentUser!.id;
    return board;
  };

  const handle = (url: string, method: string, body: Record<string, unknown>) => {
    if (url.startsWith("/api/auth/")) {
      const action = url.slice("/api/auth/".length);
      if (action === "login" && method === "POST") {
        const account = accounts.find(
          (item) => item.user.username.toLowerCase() === String(body.username).toLowerCase()
        );
        if (!account || account.password !== body.password) {
          return respond(401, { detail: "Invalid username or password." });
        }
        state.currentUser = account.user;
        return respond(200, account.user);
      }
      if (action === "register" && method === "POST") {
        const username = String(body.username);
        if (accounts.some((item) => item.user.username.toLowerCase() === username.toLowerCase())) {
          return respond(409, { detail: "That username is already taken." });
        }
        const user = { id: newId("user"), username, display_name: String(body.display_name || username) };
        accounts.push({ user, password: String(body.password) });
        state.currentUser = user;
        newBoard("My first board");
        return respond(201, user);
      }
      if (action === "logout") {
        state.currentUser = null;
        return respond(200, { status: "signed out" });
      }
      const account = accounts.find((item) => item.user.id === state.currentUser?.id);
      if (!account) return respond(401, { detail: "Not signed in" });
      if (action === "me" && method === "GET") return respond(200, account.user);
      if (action === "me" && method === "PATCH") {
        account.user.display_name = String(body.display_name) || account.user.username;
        return respond(200, account.user);
      }
      if (action === "password") {
        if (body.current_password !== account.password) {
          return respond(400, { detail: "Current password is incorrect." });
        }
        account.password = String(body.new_password);
        return respond(200, { status: "updated" });
      }
      if (action === "me" && method === "DELETE") {
        if (body.password !== account.password) return respond(400, { detail: "Password is incorrect." });
        accounts.splice(accounts.indexOf(account), 1);
        state.boards = state.boards.filter((board) => state.owners[board.id] !== account.user.id);
        state.currentUser = null;
        return respond(200, { status: "deleted" });
      }
    }

    if (!state.currentUser) return respond(401, { detail: "Not signed in" });

    if (url === "/api/boards") {
      if (method === "POST") return respond(201, newBoard(String(body.name), String(body.description ?? "")));
      return respond(
        200,
        state.boards
          .filter((board) => state.owners[board.id] === state.currentUser!.id)
          .map((board) => ({
            id: board.id,
            name: board.name,
            description: board.description,
            card_count: Object.keys(board.cards).length,
            created_at: "2026-01-01T00:00:00+00:00",
            updated_at: "2026-01-01T00:00:00+00:00",
          }))
      );
    }

    const [, boardId, kind, itemId] = url.match(/^\/api\/boards\/([^/]+)(?:\/([^/]+))?(?:\/([^/]+))?$/) ?? [];
    const board = boardId ? findBoard(boardId) : undefined;
    if (!board) return respond(404, { detail: "Board not found" });

    if (!kind) {
      if (method === "GET") return respond(200, board);
      if (method === "PATCH") {
        Object.assign(board, body);
        return respond(200, { status: "updated" });
      }
      if (method === "DELETE") {
        state.boards = state.boards.filter((item) => item !== board);
        return respond(200, { status: "deleted" });
      }
    }

    if (kind === "chat") {
      const result = state.chat(body as Parameters<ChatHandler>[0], board);
      return respond(result.status ?? 200, result.body);
    }

    if (kind === "columns") {
      if (method === "POST") {
        const id = newId("col");
        board.columns.push({ id, title: String(body.title), cardIds: [] });
        return respond(201, { id });
      }
      const column = board.columns.find((item) => item.id === itemId);
      if (!column) return respond(404, { detail: "Column not found" });
      if (method === "PATCH") {
        if (typeof body.title === "string") column.title = body.title;
        if (typeof body.position === "number") {
          board.columns.splice(board.columns.indexOf(column), 1);
          board.columns.splice(body.position, 0, column);
        }
        return respond(200, { status: "updated" });
      }
      if (method === "DELETE") {
        column.cardIds.forEach((cardId) => delete board.cards[cardId]);
        board.columns.splice(board.columns.indexOf(column), 1);
        return respond(200, { status: "deleted" });
      }
    }

    if (kind === "cards") {
      if (method === "POST") {
        const column = board.columns.find((item) => item.id === body.column_id);
        if (!column) return respond(404, { detail: "Column not found" });
        const id = newId("card");
        board.cards[id] = {
          id,
          title: String(body.title),
          details: String(body.details ?? ""),
          priority: "none",
          due_date: null,
        };
        column.cardIds.push(id);
        return respond(201, { id });
      }
      const card = itemId ? board.cards[itemId] : undefined;
      const source = card ? columnOf(board, card.id) : undefined;
      if (!card || !source) return respond(404, { detail: "Card not found" });
      if (method === "PATCH") {
        const { column_id, position, ...fields } = body as Partial<Card> & { column_id?: string; position?: number };
        Object.assign(card, fields);
        if (column_id !== undefined || position !== undefined) {
          const target = board.columns.find((item) => item.id === (column_id ?? source.id));
          if (!target) return respond(404, { detail: "Target column not found" });
          source.cardIds = source.cardIds.filter((id) => id !== card.id);
          target.cardIds.splice(position ?? target.cardIds.length, 0, card.id);
        }
        return respond(200, { status: "updated" });
      }
      if (method === "DELETE") {
        delete board.cards[card.id];
        source.cardIds = source.cardIds.filter((id) => id !== card.id);
        return respond(200, { status: "deleted" });
      }
    }
    return respond(404, { detail: "Not found" });
  };

  const fetchMock = vi.fn(async (input: RequestInfo | URL, options?: RequestInit) => {
    const body = options?.body ? JSON.parse(options.body.toString()) : {};
    return handle(input.toString(), options?.method ?? "GET", body);
  });
  vi.stubGlobal("fetch", fetchMock);

  const requests = (method: string, pattern: RegExp) =>
    fetchMock.mock.calls
      .filter(([input, options]) => (options?.method ?? "GET") === method && pattern.test(input.toString()))
      .map(([, options]) => (options?.body ? JSON.parse(options.body.toString()) : undefined));

  return { state, accounts, fetch: fetchMock, requests, board: (id = "board-demo") => state.boards.find((b) => b.id === id)! };
};
