import { expect, test, type Locator, type Page } from "@playwright/test";

const signIn = async (page: Page) => {
  await page.goto("/");
  await page.getByLabel("Username").fill("user");
  await page.getByLabel("Password", { exact: true }).fill("password");
  await page.getByRole("button", { name: "Sign In" }).click();
  await expect(page.getByRole("heading", { name: "Kanban Studio" })).toBeVisible();
  await expect(page.locator('[data-testid^="column-"]')).toHaveCount(5);
};

// Sign-in is in-memory, so a reload returns to the sign-in screen.
const reloadAndSignIn = async (page: Page) => {
  await page.reload();
  await signIn(page);
};

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
  page
    .getByTestId(`column-${columnId}`)
    .locator('[data-testid^="card-"]')
    .evaluateAll((cards) => cards.map((card) => card.getAttribute("data-testid")));

test("rejects invalid credentials", async ({ page }) => {
  await page.goto("/");
  await page.getByLabel("Username").fill("user");
  await page.getByLabel("Password", { exact: true }).fill("wrong");
  await page.getByRole("button", { name: "Sign In" }).click();
  await expect(page.getByText("Invalid username or password.")).toBeVisible();
  await expect(page.getByRole("heading", { name: "Kanban Studio" })).toHaveCount(0);
});

test("signs in and out", async ({ page }) => {
  await signIn(page);
  await page.getByRole("button", { name: "Log Out" }).click();
  await expect(page.getByRole("heading", { name: "Sign In" })).toBeVisible();
});

test("adds a card and keeps it after reload", async ({ page }) => {
  await signIn(page);
  const column = page.getByTestId("column-col-backlog");
  await column.getByRole("button", { name: /add a card/i }).click();
  await column.getByPlaceholder("Card title").fill("Playwright card");
  await column.getByPlaceholder("Details").fill("Added via e2e.");
  await column.getByRole("button", { name: /add card/i }).click();
  await expect(column.getByText("Playwright card")).toBeVisible();

  await reloadAndSignIn(page);
  await expect(page.getByTestId("column-col-backlog").getByText("Playwright card")).toBeVisible();
});

test("edits a card and keeps it after reload", async ({ page }) => {
  await signIn(page);
  await page.getByRole("button", { name: "Edit Gather customer signals", exact: true }).click();
  await page.getByLabel("Edit Gather customer signals title").fill("Gather customer signals v2");
  await page.getByLabel("Edit Gather customer signals details").fill("Edited via e2e.");
  await page.getByRole("button", { name: "Save", exact: true }).click();
  await expect(page.getByText("Gather customer signals v2")).toBeVisible();

  await reloadAndSignIn(page);
  await expect(page.getByText("Gather customer signals v2")).toBeVisible();
  await expect(page.getByText("Edited via e2e.")).toBeVisible();
});

test("deletes a card and keeps it deleted after reload", async ({ page }) => {
  await signIn(page);
  await page.getByRole("button", { name: "Delete Close onboarding sprint", exact: true }).click();
  await expect(page.getByText("Close onboarding sprint")).toHaveCount(0);

  await reloadAndSignIn(page);
  await expect(page.getByText("Close onboarding sprint")).toHaveCount(0);
});

test("renames a column and keeps it after reload", async ({ page }) => {
  await signIn(page);
  const title = page.getByTestId("column-col-discovery").getByLabel("Column title");
  await title.fill("Research");
  await title.blur();
  await expect(title).toHaveValue("Research");

  await reloadAndSignIn(page);
  await expect(page.getByTestId("column-col-discovery").getByLabel("Column title")).toHaveValue("Research");
});

test("moves a card between columns and keeps it after reload", async ({ page }) => {
  await signIn(page);
  const card = page.getByTestId("card-card-1");
  const targetColumn = page.getByTestId("column-col-review");
  const cardBox = await card.boundingBox();
  const columnBox = await targetColumn.boundingBox();
  if (!cardBox || !columnBox) {
    throw new Error("Unable to resolve drag coordinates.");
  }

  await page.mouse.move(cardBox.x + cardBox.width / 2, cardBox.y + cardBox.height / 2);
  await page.mouse.down();
  await page.mouse.move(columnBox.x + columnBox.width / 2, columnBox.y + 120, { steps: 12 });
  await page.mouse.up();
  await expect(targetColumn.getByTestId("card-card-1")).toBeVisible();

  await reloadAndSignIn(page);
  await expect(page.getByTestId("column-col-review").getByTestId("card-card-1")).toBeVisible();
});

test("drops a card into an empty column and keeps it after reload", async ({ page }) => {
  // Empty the Discovery column; its only card is card-3.
  await page.request.patch("/api/board/cards/card-3", { data: { column_id: "col-backlog" } });
  await signIn(page);
  const discovery = page.getByTestId("column-col-discovery");
  await expect(discovery.getByText("Drop a card here")).toBeVisible();

  await drag(page, page.getByTestId("card-card-4"), discovery, 80);
  await expect(discovery.getByTestId("card-card-4")).toBeVisible();

  await reloadAndSignIn(page);
  await expect(page.getByTestId("column-col-discovery").getByTestId("card-card-4")).toBeVisible();
});

test("reorders cards within a column and keeps the order after reload", async ({ page }) => {
  // New cards land at the bottom of a tall column; page.mouse does not scroll, so keep them on screen.
  await page.setViewportSize({ width: 1280, height: 1600 });
  for (const title of ["Reorder A", "Reorder B"]) {
    await page.request.post("/api/board/cards", { data: { column_id: "col-progress", title, details: "" } });
  }
  await signIn(page);
  const column = page.getByTestId("column-col-progress");
  const cardA = column.locator("article", { hasText: "Reorder A" });
  const cardB = column.locator("article", { hasText: "Reorder B" });
  const idA = await cardA.getAttribute("data-testid");
  const idB = await cardB.getAttribute("data-testid");
  const before = await cardIdsIn(page, "col-progress");
  expect(before.indexOf(idA)).toBeLessThan(before.indexOf(idB));

  await drag(page, cardB, cardA, 10);
  await expect.poll(async () => {
    const ids = await cardIdsIn(page, "col-progress");
    return ids.indexOf(idB) < ids.indexOf(idA);
  }).toBe(true);

  await reloadAndSignIn(page);
  const after = await cardIdsIn(page, "col-progress");
  expect(after.indexOf(idB)).toBeLessThan(after.indexOf(idA));
});

test("shows a text-only AI reply", async ({ page }) => {
  await page.route("/api/chat", (route) =>
    route.fulfill({
      json: { message: "You have five columns.", operations: [], board_updated: false },
    })
  );
  await signIn(page);
  await page.getByLabel("Message the board assistant").fill("How many columns?");
  await page.getByRole("button", { name: "Send message" }).click();
  await expect(page.getByText("How many columns?")).toBeVisible();
  await expect(page.getByText("You have five columns.")).toBeVisible();
});

test("refreshes the board after an AI update", async ({ page }) => {
  // Stand in for the AI: apply the change through the real API, then report it.
  await page.route("/api/chat", async (route) => {
    await page.request.post("/api/board/cards", {
      data: { column_id: "col-done", title: "AI created card", details: "" },
    });
    await route.fulfill({
      json: {
        message: "Added it to Done.",
        operations: [{ type: "create", column_id: "col-done", title: "AI created card" }],
        board_updated: true,
      },
    });
  });
  await signIn(page);
  await page.getByLabel("Message the board assistant").fill("Add a card to Done");
  await page.getByRole("button", { name: "Send message" }).click();
  await expect(page.getByText("Added it to Done.")).toBeVisible();
  await expect(page.getByTestId("column-col-done").getByText("AI created card")).toBeVisible();
});

test("live AI creates a card through OpenRouter", async ({ page }) => {
  test.skip(!process.env.OPENROUTER_API_KEY, "OPENROUTER_API_KEY is not set");
  test.setTimeout(180_000);
  await signIn(page);
  await page
    .getByLabel("Message the board assistant")
    .fill('Create a card titled "Live AI card" in the Backlog column.');
  await page.getByRole("button", { name: "Send message" }).click();
  // Wait for the request to finish, then skip only when the free provider is overloaded.
  await expect(page.getByRole("button", { name: "Thinking..." })).toBeVisible();
  await expect(page.getByRole("button", { name: "Send message" })).toHaveText("Send message", {
    timeout: 150_000,
  });
  const overloaded = page.getByText(/temporarily overloaded/);
  test.skip(await overloaded.isVisible(), "OpenRouter provider is temporarily overloaded");
  await expect(page.getByTestId("column-col-backlog").getByText("Live AI card")).toBeVisible();
});
