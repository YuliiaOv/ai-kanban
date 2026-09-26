import { expect, test, type APIRequestContext, type Locator, type Page } from "@playwright/test";

const PASSWORD = "E2e-password1";

type Board = { id: string; name: string; columns: { id: string; title: string; cardIds: string[] }[] };

const uniqueName = (prefix: string) => `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;

const getBoard = async (request: APIRequestContext, boardId: string): Promise<Board> =>
  (await request.get(`/api/boards/${boardId}`)).json();

/**
 * Register a fresh user through the API (the page shares its cookies, so it is signed in too),
 * open the app on their starter board, and return its column ids by title.
 */
const setup = async (page: Page) => {
  const username = uniqueName("e2e");
  const registered = await page.request.post("/api/auth/register", {
    data: { username, password: PASSWORD, display_name: "E2E Tester" },
  });
  expect(registered.status()).toBe(201);
  const [summary] = await (await page.request.get("/api/boards")).json();
  const board = await getBoard(page.request, summary.id);
  const columns = Object.fromEntries(board.columns.map((column) => [column.title, column.id]));
  await page.goto("/");
  await expect(page.getByLabel("Board name", { exact: true })).toHaveValue("My first board");
  const addCard = async (columnTitle: string, title: string) => {
    const response = await page.request.post(`/api/boards/${board.id}/cards`, {
      data: { column_id: columns[columnTitle], title, details: "" },
    });
    return (await response.json()).id as string;
  };
  return { username, boardId: board.id, columns, addCard };
};

// Sessions live in a cookie, so a reload stays signed in.
const reload = async (page: Page) => {
  await page.reload();
  await expect(page.getByLabel("Board name", { exact: true })).toBeVisible();
};

const column = (page: Page, columnId: string) => page.getByTestId(`column-${columnId}`);

const drag = async (page: Page, from: Locator, to: Locator, offsetY: number) => {
  const fromBox = await from.boundingBox();
  const toBox = await to.boundingBox();
  if (!fromBox || !toBox) {
    throw new Error("Unable to resolve drag coordinates.");
  }
  await page.mouse.move(fromBox.x + fromBox.width / 2, fromBox.y + fromBox.height / 2);
  await page.mouse.down();
  await page.mouse.move(toBox.x + toBox.width / 2, toBox.y + offsetY, { steps: 15 });
  await page.mouse.up();
};

const cardIdsIn = (page: Page, columnId: string) =>
  column(page, columnId)
    .locator('[data-testid^="card-"]')
    .evaluateAll((cards) => cards.map((card) => card.getAttribute("data-testid")));

const columnTitles = (page: Page) =>
  page.getByLabel("Column title", { exact: true }).evaluateAll((inputs) => inputs.map((input) => (input as HTMLInputElement).value));

test.describe("accounts", () => {
  test("rejects invalid credentials", async ({ page }) => {
    await page.goto("/");
    await page.getByLabel("Username").fill("user");
    await page.getByLabel("Password", { exact: true }).fill("wrong-password");
    await page.getByRole("button", { name: "Sign In" }).click();
    await expect(page.getByText("Invalid username or password.")).toBeVisible();
    await expect(page.getByRole("heading", { name: "Kanban Studio" })).toHaveCount(0);
  });

  test("demo user signs in to the seeded board", async ({ page }) => {
    await page.goto("/");
    await page.getByLabel("Username").fill("user");
    await page.getByLabel("Password", { exact: true }).fill("password");
    await page.getByRole("button", { name: "Sign In" }).click();
    await expect(page.getByLabel("Board name", { exact: true })).toHaveValue("Project Board");
    await expect(page.getByText("Align roadmap themes")).toBeVisible();
  });

  test("registers, stays signed in across reloads, logs out, and signs back in", async ({ page }) => {
    const username = uniqueName("ui");
    await page.goto("/");
    await page.getByRole("button", { name: "Create an account" }).click();
    await page.getByLabel("Username").fill(username);
    await page.getByLabel("Display name").fill("Ui Person");
    await page.getByLabel("Password", { exact: true }).fill(PASSWORD);
    await page.getByRole("button", { name: "Create account" }).click();
    await expect(page.getByLabel("Board name", { exact: true })).toHaveValue("My first board");
    await expect(page.getByRole("button", { name: "Account settings" })).toHaveText("Ui Person");

    await reload(page);
    await expect(page.getByRole("button", { name: "Account settings" })).toHaveText("Ui Person");

    await page.getByRole("button", { name: "Log out" }).click();
    await expect(page.getByRole("heading", { name: "Sign In" })).toBeVisible();
    await page.reload();
    await expect(page.getByRole("heading", { name: "Sign In" })).toBeVisible();

    await page.getByLabel("Username").fill(username);
    await page.getByLabel("Password", { exact: true }).fill(PASSWORD);
    await page.getByRole("button", { name: "Sign In" }).click();
    await expect(page.getByLabel("Board name", { exact: true })).toHaveValue("My first board");
  });

  test("rejects a taken username", async ({ page }) => {
    const { username } = await setup(page);
    await page.getByRole("button", { name: "Log out" }).click();
    await page.getByRole("button", { name: "Create an account" }).click();
    await page.getByLabel("Username").fill(username.toUpperCase());
    await page.getByLabel("Password", { exact: true }).fill(PASSWORD);
    await page.getByRole("button", { name: "Create account" }).click();
    await expect(page.getByText("That username is already taken.")).toBeVisible();
  });

  test("updates the display name and password", async ({ page }) => {
    const { username } = await setup(page);
    await page.getByRole("button", { name: "Account settings" }).click();
    const dialog = page.getByRole("dialog", { name: "Account" });
    await dialog.getByLabel("Display name").fill("Renamed Tester");
    await dialog.getByRole("button", { name: "Save profile" }).click();
    await expect(dialog.getByText("Profile saved.")).toBeVisible();

    await dialog.getByLabel("Current password").fill(PASSWORD);
    await dialog.getByLabel("New password").fill("Another-password1");
    await dialog.getByRole("button", { name: "Change password" }).click();
    await expect(dialog.getByText(/Password changed/)).toBeVisible();
    await dialog.getByRole("button", { name: "Close account settings" }).click();
    await expect(page.getByRole("button", { name: "Account settings" })).toHaveText("Renamed Tester");

    await page.getByRole("button", { name: "Log out" }).click();
    await page.getByLabel("Username").fill(username);
    await page.getByLabel("Password", { exact: true }).fill("Another-password1");
    await page.getByRole("button", { name: "Sign In" }).click();
    await expect(page.getByRole("button", { name: "Account settings" })).toHaveText("Renamed Tester");
  });

  test("deletes the account", async ({ page }) => {
    const { username } = await setup(page);
    page.on("dialog", (dialog) => dialog.accept());
    await page.getByRole("button", { name: "Account settings" }).click();
    await page.getByLabel("Confirm with your password").fill(PASSWORD);
    await page.getByRole("button", { name: "Delete account" }).click();
    await expect(page.getByRole("heading", { name: "Sign In" })).toBeVisible();

    await page.getByLabel("Username").fill(username);
    await page.getByLabel("Password", { exact: true }).fill(PASSWORD);
    await page.getByRole("button", { name: "Sign In" }).click();
    await expect(page.getByText("Invalid username or password.")).toBeVisible();
  });
});

test.describe("boards", () => {
  test("creates, switches, renames, and deletes boards", async ({ page }) => {
    await setup(page);
    const nav = page.getByRole("navigation", { name: "Boards" });
    await nav.getByRole("button", { name: "New board" }).click();
    await page.getByLabel("New board name").fill("Launch");
    await page.getByRole("button", { name: "Create", exact: true }).click();
    await expect(page.getByLabel("Board name", { exact: true })).toHaveValue("Launch");

    const name = page.getByLabel("Board name", { exact: true });
    await name.fill("Launch v2");
    await name.press("Enter");
    await expect(nav.getByRole("button", { name: /Launch v2/ })).toBeVisible();
    await page.getByLabel("Board description").fill("Everything for launch day");
    await page.getByLabel("Board description").press("Enter");

    await nav.getByRole("button", { name: /My first board/ }).click();
    await expect(page.getByLabel("Board name", { exact: true })).toHaveValue("My first board");
    await reload(page);
    await nav.getByRole("button", { name: /Launch v2/ }).click();
    await expect(page.getByLabel("Board description")).toHaveValue("Everything for launch day");

    page.on("dialog", (dialog) => dialog.accept());
    await page.getByRole("button", { name: "Delete board" }).click();
    await expect(page.getByLabel("Board name", { exact: true })).toHaveValue("My first board");
    await expect(nav.getByRole("button", { name: /Launch v2/ })).toHaveCount(0);
  });

  test("keeps each user's boards private", async ({ page, browser }) => {
    const { boardId } = await setup(page);
    const other = await browser.newContext({ baseURL: test.info().project.use.baseURL });
    await other.request.post("/api/auth/register", { data: { username: uniqueName("other"), password: PASSWORD } });

    expect((await other.request.get(`/api/boards/${boardId}`)).status()).toBe(404);
    const otherBoards = await (await other.request.get("/api/boards")).json();
    expect(otherBoards.map((board: { id: string }) => board.id)).not.toContain(boardId);
    await other.close();
  });

  test("filters cards by search and priority", async ({ page }) => {
    const { boardId, addCard } = await setup(page);
    await addCard("Backlog", "Write release notes");
    const urgent = await addCard("Review", "Fix login bug");
    await page.request.patch(`/api/boards/${boardId}/cards/${urgent}`, { data: { priority: "high" } });
    await reload(page);

    await page.getByLabel("Search cards").fill("release");
    await expect(page.getByText("1 of 2 cards match.")).toBeVisible();
    await expect(page.locator("article", { hasText: "Fix login bug" })).toHaveAttribute("data-dimmed", "true");

    await page.getByLabel("Search cards").fill("");
    await page.getByLabel("Filter by priority").selectOption("high");
    await expect(page.locator("article", { hasText: "Write release notes" })).toHaveAttribute("data-dimmed", "true");
    await expect(page.locator("article", { hasText: "Fix login bug" })).not.toHaveAttribute("data-dimmed");
  });
});

test.describe("cards and columns", () => {
  test("adds a card and keeps it after reload", async ({ page }) => {
    const { columns } = await setup(page);
    const backlog = column(page, columns.Backlog);
    await backlog.getByRole("button", { name: /add a card/i }).click();
    await backlog.getByPlaceholder("Card title").fill("Playwright card");
    await backlog.getByPlaceholder("Details").fill("Added via e2e.");
    await backlog.getByRole("button", { name: /add card/i }).click();
    await expect(backlog.getByText("Playwright card")).toBeVisible();

    await reload(page);
    await expect(column(page, columns.Backlog).getByText("Playwright card")).toBeVisible();
    await expect(page.getByRole("navigation", { name: "Boards" }).getByTitle("1 card")).toBeVisible();
  });

  test("edits a card's details, priority, and due date and keeps them after reload", async ({ page }) => {
    const { addCard } = await setup(page);
    await addCard("Backlog", "Gather customer signals");
    await reload(page);

    await page.getByRole("button", { name: "Edit Gather customer signals", exact: true }).click();
    await page.getByLabel("Edit Gather customer signals title").fill("Gather customer signals v2");
    await page.getByLabel("Edit Gather customer signals details").fill("Edited via e2e.");
    await page.getByLabel("Edit Gather customer signals priority").selectOption("high");
    await page.getByLabel("Edit Gather customer signals due date").fill("2031-02-14");
    await page.getByRole("button", { name: "Save", exact: true }).click();
    await expect(page.getByText("Gather customer signals v2")).toBeVisible();

    await reload(page);
    const card = page.locator("article", { hasText: "Gather customer signals v2" });
    await expect(card.getByText("Edited via e2e.")).toBeVisible();
    await expect(card.getByText("high")).toBeVisible();
    await expect(card.getByText("Feb 14")).toBeVisible();
  });

  test("deletes a card and keeps it deleted after reload", async ({ page }) => {
    const { addCard } = await setup(page);
    await addCard("Done", "Close onboarding sprint");
    await reload(page);
    await page.getByRole("button", { name: "Delete Close onboarding sprint", exact: true }).click();
    await expect(page.getByText("Close onboarding sprint")).toHaveCount(0);

    await reload(page);
    await expect(page.getByText("Close onboarding sprint")).toHaveCount(0);
  });

  test("renames a column and keeps it after reload", async ({ page }) => {
    const { columns } = await setup(page);
    const title = column(page, columns.Discovery).getByLabel("Column title");
    await title.fill("Research");
    await title.blur();
    await expect(title).toHaveValue("Research");

    await reload(page);
    await expect(column(page, columns.Discovery).getByLabel("Column title")).toHaveValue("Research");
  });

  test("adds, reorders, and deletes columns and keeps them after reload", async ({ page }) => {
    await setup(page);
    page.on("dialog", (dialog) => dialog.accept());
    await page.getByLabel("New column title").fill("Blocked");
    await page.getByRole("button", { name: "Add column" }).click();
    await expect.poll(() => columnTitles(page)).toEqual(["Backlog", "Discovery", "In Progress", "Review", "Done", "Blocked"]);

    await page.getByRole("button", { name: "Move Blocked left" }).click();
    await expect.poll(() => columnTitles(page)).toEqual(["Backlog", "Discovery", "In Progress", "Review", "Blocked", "Done"]);
    await page.getByRole("button", { name: "Delete column Discovery" }).click();
    await expect.poll(() => columnTitles(page)).toEqual(["Backlog", "In Progress", "Review", "Blocked", "Done"]);

    await reload(page);
    await expect.poll(() => columnTitles(page)).toEqual(["Backlog", "In Progress", "Review", "Blocked", "Done"]);
  });

  test("moves a card between columns and keeps it after reload", async ({ page }) => {
    const { columns, addCard } = await setup(page);
    const cardId = await addCard("Backlog", "Travelling card");
    await reload(page);

    await drag(page, page.getByTestId(`card-${cardId}`), column(page, columns.Review), 120);
    await expect(column(page, columns.Review).getByTestId(`card-${cardId}`)).toBeVisible();

    await reload(page);
    await expect(column(page, columns.Review).getByTestId(`card-${cardId}`)).toBeVisible();
  });

  test("drops a card into an empty column and keeps it after reload", async ({ page }) => {
    const { columns, addCard } = await setup(page);
    const cardId = await addCard("In Progress", "Dropped card");
    await reload(page);
    const discovery = column(page, columns.Discovery);
    await expect(discovery.getByText("Drop a card here")).toBeVisible();

    await drag(page, page.getByTestId(`card-${cardId}`), discovery, 80);
    await expect(discovery.getByTestId(`card-${cardId}`)).toBeVisible();

    await reload(page);
    await expect(column(page, columns.Discovery).getByTestId(`card-${cardId}`)).toBeVisible();
  });

  test("reorders cards within a column and keeps the order after reload", async ({ page }) => {
    const { columns, addCard } = await setup(page);
    const idA = `card-${await addCard("In Progress", "Reorder A")}`;
    const idB = `card-${await addCard("In Progress", "Reorder B")}`;
    await reload(page);
    expect(await cardIdsIn(page, columns["In Progress"])).toEqual([idA, idB]);

    await drag(page, page.getByTestId(idB), page.getByTestId(idA), 10);
    await expect.poll(() => cardIdsIn(page, columns["In Progress"])).toEqual([idB, idA]);

    await reload(page);
    expect(await cardIdsIn(page, columns["In Progress"])).toEqual([idB, idA]);
  });
});

test.describe("assistant", () => {
  test("shows a text-only AI reply", async ({ page }) => {
    await page.route("**/api/boards/*/chat", (route) =>
      route.fulfill({ json: { message: "You have five columns.", operations: [], board_updated: false } })
    );
    await setup(page);
    await page.getByLabel("Message the board assistant").fill("How many columns?");
    await page.getByRole("button", { name: "Send message" }).click();
    await expect(page.getByText("How many columns?")).toBeVisible();
    await expect(page.getByText("You have five columns.")).toBeVisible();
  });

  test("refreshes the board after an AI update", async ({ page }) => {
    const { boardId, columns } = await setup(page);
    // Stand in for the AI: apply the change through the real API, then report it.
    await page.route(`**/api/boards/${boardId}/chat`, async (route) => {
      await page.request.post(`/api/boards/${boardId}/cards`, {
        data: { column_id: columns.Done, title: "AI created card", details: "" },
      });
      await route.fulfill({ json: { message: "Added it to Done.", operations: [], board_updated: true } });
    });
    await page.getByLabel("Message the board assistant").fill("Add a card to Done");
    await page.getByRole("button", { name: "Send message" }).click();
    await expect(page.getByText("Added it to Done.")).toBeVisible();
    await expect(column(page, columns.Done).getByText("AI created card")).toBeVisible();
    await expect(page.getByRole("navigation", { name: "Boards" }).getByTitle("1 card")).toBeVisible();
  });

  test("live AI creates a card through OpenRouter", async ({ page }) => {
    test.skip(!process.env.OPENROUTER_API_KEY, "OPENROUTER_API_KEY is not set");
    test.setTimeout(180_000);
    const { columns } = await setup(page);
    await page
      .getByLabel("Message the board assistant")
      .fill('Create a card titled "Live AI card" in the Backlog column.');
    await page.getByRole("button", { name: "Send message" }).click();
    // Wait for the request to finish, then skip only when the free provider is overloaded.
    await expect(page.getByRole("button", { name: "Thinking..." })).toBeVisible();
    await expect(page.getByRole("button", { name: "Send message" })).toHaveText("Send message", {
      timeout: 150_000,
    });
    const overloaded = page.getByText(/temporarily overloaded|rate.?limit|failed while generating/i);
    test.skip(await overloaded.isVisible(), "OpenRouter provider is temporarily unavailable");
    await expect(column(page, columns.Backlog).getByText("Live AI card")).toBeVisible();
  });
});
