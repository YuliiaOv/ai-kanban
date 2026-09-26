"use client";

import { FormEvent, useMemo, useState } from "react";
import { KanbanBoard } from "@/components/KanbanBoard";

const USERNAME = "user";
const PASSWORD = "password";

export default function Home() {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [isPasswordVisible, setIsPasswordVisible] = useState(false);
  const [error, setError] = useState("");
  const [isAuthenticated, setIsAuthenticated] = useState(false);

  const isValidCredentials = useMemo(
    () => username === USERNAME && password === PASSWORD,
    [password, username]
  );

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (isValidCredentials) {
      setError("");
      setIsAuthenticated(true);
      return;
    }

    setError("Invalid username or password.");
  };

  const handleLogout = () => {
    setIsAuthenticated(false);
    setUsername("");
    setPassword("");
    setIsPasswordVisible(false);
    setError("");
  };

  if (!isAuthenticated) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-[radial-gradient(circle,_rgba(32,157,215,0.16),_rgba(255,255,255,0)_55%)] px-6 py-10 text-[var(--navy-dark)]">
        <div className="w-full max-w-md rounded-[28px] border border-[var(--stroke)] bg-white p-8 shadow-[var(--shadow)]">
          <div className="mb-6">
            <p className="text-xs font-semibold uppercase tracking-[0.32em] text-[var(--gray-text)]">
              Project access
            </p>
            <h1 className="mt-3 font-display text-4xl font-semibold text-[var(--navy-dark)]">
              Sign In
            </h1>
          </div>

          <form onSubmit={handleSubmit} className="space-y-5">
            <div className="space-y-2">
              <label htmlFor="username" className="text-sm font-medium text-[var(--navy-dark)]">
                Username
              </label>
              <input
                id="username"
                type="text"
                value={username}
                onChange={(event) => setUsername(event.target.value)}
                className="w-full rounded-2xl border border-[var(--stroke)] bg-[var(--surface)] px-4 py-3 text-base outline-none ring-0 transition focus:border-[var(--primary-blue)]"
                autoComplete="username"
              />
            </div>

            <div className="space-y-2">
              <label htmlFor="password" className="text-sm font-medium text-[var(--navy-dark)]">
                Password
              </label>
              <div className="relative">
                <input
                  id="password"
                  type={isPasswordVisible ? "text" : "password"}
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  className="w-full rounded-2xl border border-[var(--stroke)] bg-[var(--surface)] px-4 py-3 pr-12 text-base outline-none ring-0 transition focus:border-[var(--primary-blue)]"
                  autoComplete="current-password"
                />
                <button
                  type="button"
                  aria-label={isPasswordVisible ? "Hide password" : "Show password"}
                  title={isPasswordVisible ? "Hide password" : "Show password"}
                  onClick={() => setIsPasswordVisible((visible) => !visible)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 rounded-full p-2 text-[var(--gray-text)] transition hover:text-[var(--navy-dark)]"
                >
                  <svg
                    aria-hidden="true"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="1.8"
                    className="h-5 w-5"
                  >
                    <path d="M2.5 12s3.5-5 9.5-5 9.5 5 9.5 5-3.5 5-9.5 5-9.5-5-9.5-5Z" />
                    <circle cx="12" cy="12" r="2.5" />
                  </svg>
                </button>
              </div>
            </div>

            {error ? (
              <p className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
                {error}
              </p>
            ) : null}

            <button
              type="submit"
              className="w-full rounded-full bg-[var(--secondary-purple)] px-4 py-3 text-sm font-semibold uppercase tracking-[0.18em] text-white transition hover:opacity-90"
            >
              Sign In
            </button>
          </form>
        </div>
      </main>
    );
  }

  return <KanbanBoard onLogout={handleLogout} />;
}
