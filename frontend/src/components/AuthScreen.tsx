"use client";

import { FormEvent, useState } from "react";
import { isStrongPassword, login, PASSWORD_RULES, register, type User } from "@/lib/authApi";
import { EyeIcon } from "@/components/icons";

type AuthScreenProps = {
  onSignedIn: (user: User) => void;
};

const inputClass =
  "w-full rounded-2xl border border-[var(--stroke)] bg-[var(--surface)] px-4 py-3 text-base outline-none transition focus:border-[var(--primary-blue)]";

export const AuthScreen = ({ onSignedIn }: AuthScreenProps) => {
  const [mode, setMode] = useState<"signin" | "register">("signin");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [isPasswordVisible, setIsPasswordVisible] = useState(false);
  const [error, setError] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const isRegister = mode === "register";

  const switchMode = () => {
    setMode(isRegister ? "signin" : "register");
    setError("");
  };

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (isRegister && !isStrongPassword(password)) {
      setError(PASSWORD_RULES);
      return;
    }
    setIsSubmitting(true);
    setError("");
    try {
      const user = isRegister
        ? await register(username.trim(), password, displayName.trim())
        : await login(username.trim(), password);
      onSignedIn(user);
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Unable to sign in.");
      setIsSubmitting(false);
    }
  };

  return (
    <main className="flex min-h-screen items-center justify-center bg-[radial-gradient(circle,_rgba(32,157,215,0.16),_rgba(255,255,255,0)_55%)] px-6 py-10 text-[var(--navy-dark)]">
      <div className="w-full max-w-md rounded-[28px] border border-[var(--stroke)] bg-white p-8 shadow-[var(--shadow)]">
        <div className="mb-6">
          <p className="text-xs font-semibold uppercase tracking-[0.32em] text-[var(--gray-text)]">
            Kanban Studio
          </p>
          <h1 className="mt-3 font-display text-4xl font-semibold text-[var(--navy-dark)]">
            {isRegister ? "Create account" : "Sign In"}
          </h1>
        </div>

        <form onSubmit={handleSubmit} className="space-y-5">
          <div className="space-y-2">
            <label htmlFor="username" className="text-sm font-medium">
              Username
            </label>
            <input
              id="username"
              type="text"
              value={username}
              onChange={(event) => setUsername(event.target.value)}
              className={inputClass}
              autoComplete="username"
              required
            />
            {isRegister ? (
              <p className="text-xs text-[var(--gray-text)]">
                3-32 letters, digits, dots, dashes, or underscores.
              </p>
            ) : null}
          </div>

          {isRegister ? (
            <div className="space-y-2">
              <label htmlFor="display-name" className="text-sm font-medium">
                Display name <span className="text-[var(--gray-text)]">(optional)</span>
              </label>
              <input
                id="display-name"
                type="text"
                value={displayName}
                onChange={(event) => setDisplayName(event.target.value)}
                className={inputClass}
                autoComplete="name"
              />
            </div>
          ) : null}

          <div className="space-y-2">
            <label htmlFor="password" className="text-sm font-medium">
              Password
            </label>
            <div className="relative">
              <input
                id="password"
                type={isPasswordVisible ? "text" : "password"}
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                className={`${inputClass} pr-12`}
                autoComplete={isRegister ? "new-password" : "current-password"}
                required
              />
              <button
                type="button"
                aria-label={isPasswordVisible ? "Hide password" : "Show password"}
                title={isPasswordVisible ? "Hide password" : "Show password"}
                onClick={() => setIsPasswordVisible((visible) => !visible)}
                className="absolute right-3 top-1/2 -translate-y-1/2 rounded-full p-2 text-[var(--gray-text)] transition hover:text-[var(--navy-dark)]"
              >
                <EyeIcon className="h-5 w-5" />
              </button>
            </div>
            {isRegister ? (
              <p className="text-xs text-[var(--gray-text)]">
                At least 8 characters, with an uppercase letter, a lowercase letter, a number, and a special character.
              </p>
            ) : null}
          </div>

          {error ? (
            <p role="alert" className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
              {error}
            </p>
          ) : null}

          <button
            type="submit"
            disabled={isSubmitting}
            className="w-full rounded-full bg-[var(--secondary-purple)] px-4 py-3 text-sm font-semibold uppercase tracking-[0.18em] text-white transition hover:opacity-90 disabled:opacity-60"
          >
            {isRegister ? "Create account" : "Sign In"}
          </button>
        </form>

        <p className="mt-6 text-center text-sm text-[var(--gray-text)]">
          {isRegister ? "Already have an account?" : "New here?"}{" "}
          <button
            type="button"
            onClick={switchMode}
            className="font-semibold text-[var(--primary-blue)] hover:underline"
          >
            {isRegister ? "Sign in" : "Create an account"}
          </button>
        </p>
      </div>
    </main>
  );
};
