"use client";

import { useEffect, useState } from "react";
import { AuthScreen } from "@/components/AuthScreen";
import { Workspace } from "@/components/Workspace";
import { fetchMe, logout, type User } from "@/lib/authApi";

export default function Home() {
  // undefined while the session check is in flight, null when signed out.
  const [user, setUser] = useState<User | null | undefined>(undefined);

  useEffect(() => {
    fetchMe()
      .then(setUser)
      .catch(() => setUser(null));
  }, []);

  const handleLogout = async () => {
    await logout().catch(() => undefined);
    setUser(null);
  };

  if (user === undefined) {
    return (
      <main className="flex min-h-screen items-center justify-center text-sm text-[var(--gray-text)]">
        Loading...
      </main>
    );
  }

  if (user === null) {
    return <AuthScreen onSignedIn={setUser} />;
  }

  return (
    <Workspace
      user={user}
      onUserChange={setUser}
      onLogout={handleLogout}
      onSignedOut={() => setUser(null)}
    />
  );
}
