import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import Home from "@/app/page";
import { installFakeApi } from "@/test/fakeApi";

const signIn = async (username: string, password: string) => {
  await userEvent.type(await screen.findByLabelText(/username/i), username);
  await userEvent.type(screen.getByLabelText(/^password$/i), password);
  await userEvent.click(screen.getByRole("button", { name: /^sign in$/i }));
};

describe("Home page auth flow", () => {
  it("requires sign-in before showing any board", async () => {
    installFakeApi({ signedIn: false });
    render(<Home />);

    expect(await screen.findByRole("heading", { name: /sign in/i })).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: /kanban studio/i })).not.toBeInTheDocument();
  });

  it("restores an existing session without asking to sign in", async () => {
    installFakeApi({ signedIn: true });
    render(<Home />);

    expect(await screen.findByRole("heading", { name: /kanban studio/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /account settings/i })).toHaveTextContent("Demo User");
    expect(await screen.findByLabelText("Board name")).toHaveValue("Project Board");
  });

  it("signs in, shows the board, and logs out", async () => {
    const api = installFakeApi({ signedIn: false });
    render(<Home />);

    await signIn("user", "password");
    expect(await screen.findByLabelText("Board name")).toHaveValue("Project Board");

    await userEvent.click(screen.getByRole("button", { name: /log out/i }));
    expect(await screen.findByRole("heading", { name: /sign in/i })).toBeInTheDocument();
    expect(api.state.currentUser).toBeNull();
  });

  it("rejects invalid credentials with the server message", async () => {
    installFakeApi({ signedIn: false });
    render(<Home />);

    await signIn("user", "wrong-password");

    expect(await screen.findByRole("alert")).toHaveTextContent("Invalid username or password.");
    expect(screen.queryByRole("heading", { name: /kanban studio/i })).not.toBeInTheDocument();
  });

  it("creates an account with a starter board", async () => {
    const api = installFakeApi({ signedIn: false });
    render(<Home />);

    await userEvent.click(await screen.findByRole("button", { name: /create an account/i }));
    expect(screen.getByRole("heading", { name: /create account/i })).toBeInTheDocument();
    await userEvent.type(screen.getByLabelText(/username/i), "newbie");
    await userEvent.type(screen.getByLabelText(/display name/i), "New Person");
    await userEvent.type(screen.getByLabelText(/^password$/i), "Long-enough1");
    await userEvent.click(screen.getByRole("button", { name: /^create account$/i }));

    expect(await screen.findByLabelText("Board name")).toHaveValue("My first board");
    expect(screen.getByRole("button", { name: /account settings/i })).toHaveTextContent("New Person");
    expect(api.requests("POST", /register/)[0]).toEqual({
      username: "newbie",
      password: "Long-enough1",
      display_name: "New Person",
    });
  });

  it("rejects a weak password before registering", async () => {
    const api = installFakeApi({ signedIn: false });
    render(<Home />);

    await userEvent.click(await screen.findByRole("button", { name: /create an account/i }));
    await userEvent.type(screen.getByLabelText(/username/i), "newbie");
    await userEvent.type(screen.getByLabelText(/^password$/i), "long-enough");
    await userEvent.click(screen.getByRole("button", { name: /^create account$/i }));

    expect(await screen.findByRole("alert")).toHaveTextContent(/at least 8 characters and include an uppercase letter/i);
    expect(api.requests("POST", /register/)).toHaveLength(0);
  });

  it("shows a registration conflict and can switch back to sign in", async () => {
    installFakeApi({ signedIn: false });
    render(<Home />);

    await userEvent.click(await screen.findByRole("button", { name: /create an account/i }));
    await userEvent.type(screen.getByLabelText(/username/i), "USER");
    await userEvent.type(screen.getByLabelText(/^password$/i), "Long-enough1");
    await userEvent.click(screen.getByRole("button", { name: /^create account$/i }));
    expect(await screen.findByRole("alert")).toHaveTextContent("That username is already taken.");

    await userEvent.click(screen.getByRole("button", { name: /^sign in$/i }));
    await waitFor(() => expect(screen.getByRole("heading", { name: /sign in/i })).toBeInTheDocument());
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("toggles password visibility", async () => {
    installFakeApi({ signedIn: false });
    render(<Home />);

    const passwordInput = await screen.findByLabelText(/^password$/i);
    expect(passwordInput).toHaveAttribute("type", "password");

    await userEvent.click(screen.getByRole("button", { name: /show password/i }));
    expect(passwordInput).toHaveAttribute("type", "text");

    await userEvent.click(screen.getByRole("button", { name: /hide password/i }));
    expect(passwordInput).toHaveAttribute("type", "password");
  });
});
