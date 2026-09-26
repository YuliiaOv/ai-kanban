import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, vi } from "vitest";
import { Workspace } from "@/components/Workspace";
import type { User } from "@/lib/authApi";
import { installFakeApi, type FakeApi } from "@/test/fakeApi";

let api: FakeApi;
const user: User = { id: "user-demo", username: "user", display_name: "Demo User" };

beforeEach(() => {
  api = installFakeApi();
});

const renderWorkspace = async (props: Partial<Parameters<typeof Workspace>[0]> = {}) => {
  const handlers = { onUserChange: vi.fn(), onLogout: vi.fn(), onSignedOut: vi.fn(), ...props };
  render(<Workspace user={user} {...handlers} />);
  await screen.findByLabelText("Board name");
  return handlers;
};

const boardNav = () => screen.getByRole("navigation", { name: "Boards" });
const boardButtons = () =>
  within(boardNav())
    .getAllByRole("button")
    .filter((button) => button.textContent !== "New board");

describe("Workspace", () => {
  it("lists the user's boards and opens the first one", async () => {
    await renderWorkspace();

    expect(boardButtons().map((button) => button.textContent)).toEqual(["Project Board8"]);
    expect(within(boardNav()).getByRole("button", { current: "page" })).toHaveTextContent("Project Board");
  });

  it("creates a board, opens it, and switches back", async () => {
    await renderWorkspace();

    await userEvent.click(screen.getByRole("button", { name: "New board" }));
    await userEvent.type(screen.getByLabelText("New board name"), "Roadmap");
    await userEvent.click(screen.getByRole("button", { name: "Create" }));

    await waitFor(() => expect(screen.getByLabelText("Board name")).toHaveValue("Roadmap"));
    expect(within(boardNav()).getByRole("button", { current: "page" })).toHaveTextContent("Roadmap");
    expect(screen.getAllByTestId(/^column-/)).toHaveLength(5);

    await userEvent.click(within(boardNav()).getByRole("button", { name: /project board/i }));
    await waitFor(() => expect(screen.getByLabelText("Board name")).toHaveValue("Project Board"));
    expect(screen.getByTestId("card-card-1")).toBeInTheDocument();
  });

  it("does not create a board without a name", async () => {
    await renderWorkspace();

    await userEvent.click(screen.getByRole("button", { name: "New board" }));
    await userEvent.click(screen.getByRole("button", { name: "Create" }));

    expect(api.requests("POST", /\/api\/boards$/)).toHaveLength(0);
    await userEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(screen.getByRole("button", { name: "New board" })).toBeInTheDocument();
  });

  it("updates the board list when a card is added", async () => {
    await renderWorkspace();
    const backlog = screen.getByTestId("column-col-backlog");

    await userEvent.click(within(backlog).getByRole("button", { name: /add a card/i }));
    await userEvent.type(within(backlog).getByPlaceholderText(/card title/i), "Ninth");
    await userEvent.click(within(backlog).getByRole("button", { name: /add card/i }));

    await waitFor(() => expect(boardButtons()[0]).toHaveTextContent("Project Board9"));
  });

  it("falls back to another board after deleting one, then to the empty state", async () => {
    vi.spyOn(window, "confirm").mockReturnValue(true);
    await renderWorkspace();
    await userEvent.click(screen.getByRole("button", { name: "New board" }));
    await userEvent.type(screen.getByLabelText("New board name"), "Temporary");
    await userEvent.click(screen.getByRole("button", { name: "Create" }));
    await waitFor(() => expect(screen.getByLabelText("Board name")).toHaveValue("Temporary"));

    await userEvent.click(screen.getByRole("button", { name: /delete board/i }));
    await waitFor(() => expect(screen.getByLabelText("Board name")).toHaveValue("Project Board"));
    expect(boardButtons()).toHaveLength(1);

    await userEvent.click(screen.getByRole("button", { name: /delete board/i }));
    expect(await screen.findByText(/you have no boards yet/i)).toBeInTheDocument();
  });

  it("logs out from the header", async () => {
    const { onLogout } = await renderWorkspace();

    await userEvent.click(screen.getByRole("button", { name: /log out/i }));

    expect(onLogout).toHaveBeenCalled();
  });
});

describe("Account settings", () => {
  const openAccount = async (props: Partial<Parameters<typeof Workspace>[0]> = {}) => {
    const handlers = await renderWorkspace(props);
    await userEvent.click(screen.getByRole("button", { name: /account settings/i }));
    return { handlers, dialog: screen.getByRole("dialog", { name: "Account" }) };
  };

  it("saves the display name", async () => {
    const { handlers, dialog } = await openAccount();
    const input = within(dialog).getByLabelText("Display name");
    expect(input).toHaveValue("Demo User");

    await userEvent.clear(input);
    await userEvent.type(input, "Product Lead");
    await userEvent.click(within(dialog).getByRole("button", { name: "Save profile" }));

    expect(await within(dialog).findByText("Profile saved.")).toBeInTheDocument();
    expect(handlers.onUserChange).toHaveBeenCalledWith({ ...user, display_name: "Product Lead" });
  });

  it("changes the password and reports a wrong current password", async () => {
    const { dialog } = await openAccount();
    const current = within(dialog).getByLabelText("Current password");
    const next = within(dialog).getByLabelText("New password");

    await userEvent.type(current, "not-it");
    await userEvent.type(next, "brand-new-pass");
    await userEvent.click(within(dialog).getByRole("button", { name: "Change password" }));
    expect(await within(dialog).findByRole("alert")).toHaveTextContent(/include an uppercase letter/i);

    await userEvent.clear(next);
    await userEvent.type(next, "Brand-new-pass1");
    await userEvent.click(within(dialog).getByRole("button", { name: "Change password" }));
    expect(await within(dialog).findByRole("alert")).toHaveTextContent("Current password is incorrect.");

    await userEvent.clear(current);
    await userEvent.type(current, "password");
    await userEvent.click(within(dialog).getByRole("button", { name: "Change password" }));
    expect(await within(dialog).findByRole("status")).toHaveTextContent("Password changed.");
    expect(api.accounts[0].password).toBe("Brand-new-pass1");
    expect(current).toHaveValue("");
  });

  it("deletes the account only after confirmation and the right password", async () => {
    const confirm = vi.spyOn(window, "confirm").mockReturnValueOnce(false).mockReturnValue(true);
    const { handlers, dialog } = await openAccount();
    const password = within(dialog).getByLabelText("Confirm with your password");

    await userEvent.type(password, "password");
    await userEvent.click(within(dialog).getByRole("button", { name: "Delete account" }));
    expect(api.accounts).toHaveLength(1);

    await userEvent.clear(password);
    await userEvent.type(password, "wrong");
    await userEvent.click(within(dialog).getByRole("button", { name: "Delete account" }));
    expect(await within(dialog).findByRole("alert")).toHaveTextContent("Password is incorrect.");

    await userEvent.clear(password);
    await userEvent.type(password, "password");
    await userEvent.click(within(dialog).getByRole("button", { name: "Delete account" }));
    await waitFor(() => expect(handlers.onSignedOut).toHaveBeenCalled());
    expect(confirm).toHaveBeenCalledTimes(3);
    expect(api.accounts).toHaveLength(0);
  });

  it("closes with the close button or Escape", async () => {
    await openAccount();
    await userEvent.click(screen.getByRole("button", { name: "Close account settings" }));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: /account settings/i }));
    await userEvent.type(screen.getByLabelText("Display name"), "{Escape}");
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });
});
