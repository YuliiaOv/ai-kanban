"use client";

import { FormEvent, useState } from "react";
import {
  changePassword,
  deleteAccount,
  isStrongPassword,
  PASSWORD_RULES,
  updateProfile,
  type User,
} from "@/lib/authApi";
import { CloseIcon } from "@/components/icons";

type AccountDialogProps = {
  user: User;
  onClose: () => void;
  onUserChange: (user: User) => void;
  onAccountDeleted: () => void;
};

type Status = { kind: "success" | "error"; text: string } | null;

const inputClass =
  "w-full rounded-lg border border-[var(--stroke)] bg-[var(--surface)] px-3 py-2 text-sm outline-none focus:border-[var(--primary-blue)]";
const sectionTitle = "font-display text-base font-semibold text-[var(--navy-dark)]";

const StatusMessage = ({ status }: { status: Status }) =>
  status ? (
    <p
      role={status.kind === "error" ? "alert" : "status"}
      className={
        status.kind === "error"
          ? "rounded-lg bg-red-50 px-3 py-2 text-xs text-red-700"
          : "rounded-lg bg-emerald-50 px-3 py-2 text-xs text-emerald-700"
      }
    >
      {status.text}
    </p>
  ) : null;

const errorText = (error: unknown) => (error instanceof Error ? error.message : "Something went wrong.");

export const AccountDialog = ({ user, onClose, onUserChange, onAccountDeleted }: AccountDialogProps) => {
  const [displayName, setDisplayName] = useState(user.display_name);
  const [profileStatus, setProfileStatus] = useState<Status>(null);
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [passwordStatus, setPasswordStatus] = useState<Status>(null);
  const [deletePassword, setDeletePassword] = useState("");
  const [deleteStatus, setDeleteStatus] = useState<Status>(null);

  const handleProfile = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    try {
      onUserChange(await updateProfile(displayName.trim()));
      setProfileStatus({ kind: "success", text: "Profile saved." });
    } catch (error) {
      setProfileStatus({ kind: "error", text: errorText(error) });
    }
  };

  const handlePassword = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!isStrongPassword(newPassword)) {
      setPasswordStatus({ kind: "error", text: PASSWORD_RULES });
      return;
    }
    try {
      await changePassword(currentPassword, newPassword);
      setCurrentPassword("");
      setNewPassword("");
      setPasswordStatus({ kind: "success", text: "Password changed. Other sessions were signed out." });
    } catch (error) {
      setPasswordStatus({ kind: "error", text: errorText(error) });
    }
  };

  const handleDelete = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!window.confirm("Delete your account and all of your boards? This cannot be undone.")) return;
    try {
      await deleteAccount(deletePassword);
      onAccountDeleted();
    } catch (error) {
      setDeleteStatus({ kind: "error", text: errorText(error) });
    }
  };

  return (
    <div
      className="fixed inset-0 z-30 flex items-start justify-center overflow-y-auto bg-[rgba(3,33,71,0.45)] p-4 sm:p-10"
      onKeyDown={(event) => event.key === "Escape" && onClose()}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="account-title"
        className="w-full max-w-lg space-y-6 rounded-2xl bg-white p-6 shadow-[var(--shadow)]"
      >
        <div className="flex items-start justify-between">
          <div>
            <h2 id="account-title" className="font-display text-2xl font-semibold text-[var(--navy-dark)]">
              Account
            </h2>
            <p className="text-sm text-[var(--gray-text)]">Signed in as {user.username}</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close account settings"
            className="rounded-full p-2 text-[var(--gray-text)] hover:bg-[var(--surface)] hover:text-[var(--navy-dark)]"
          >
            <CloseIcon className="h-5 w-5" />
          </button>
        </div>

        <form onSubmit={handleProfile} className="space-y-2">
          <h3 className={sectionTitle}>Profile</h3>
          <label htmlFor="account-display-name" className="block text-sm">
            Display name
          </label>
          <input
            id="account-display-name"
            value={displayName}
            onChange={(event) => setDisplayName(event.target.value)}
            maxLength={64}
            className={inputClass}
          />
          <StatusMessage status={profileStatus} />
          <button type="submit" className="rounded-full bg-[var(--secondary-purple)] px-4 py-1.5 text-xs font-semibold text-white">
            Save profile
          </button>
        </form>

        <form onSubmit={handlePassword} className="space-y-2 border-t border-[var(--stroke)] pt-5">
          <h3 className={sectionTitle}>Change password</h3>
          <label htmlFor="account-current-password" className="block text-sm">
            Current password
          </label>
          <input
            id="account-current-password"
            type="password"
            value={currentPassword}
            onChange={(event) => setCurrentPassword(event.target.value)}
            autoComplete="current-password"
            required
            className={inputClass}
          />
          <label htmlFor="account-new-password" className="block text-sm">
            New password
          </label>
          <input
            id="account-new-password"
            type="password"
            value={newPassword}
            onChange={(event) => setNewPassword(event.target.value)}
            autoComplete="new-password"
            required
            className={inputClass}
          />
          <p className="text-xs text-[var(--gray-text)]">
            At least 8 characters, with an uppercase letter, a lowercase letter, a number, and a special character.
          </p>
          <StatusMessage status={passwordStatus} />
          <button type="submit" className="rounded-full bg-[var(--secondary-purple)] px-4 py-1.5 text-xs font-semibold text-white">
            Change password
          </button>
        </form>

        <form onSubmit={handleDelete} className="space-y-2 border-t border-[var(--stroke)] pt-5">
          <h3 className={sectionTitle}>Delete account</h3>
          <p className="text-xs text-[var(--gray-text)]">Permanently removes your account and every board you own.</p>
          <label htmlFor="account-delete-password" className="block text-sm">
            Confirm with your password
          </label>
          <input
            id="account-delete-password"
            type="password"
            value={deletePassword}
            onChange={(event) => setDeletePassword(event.target.value)}
            autoComplete="current-password"
            required
            className={inputClass}
          />
          <StatusMessage status={deleteStatus} />
          <button type="submit" className="rounded-full bg-red-600 px-4 py-1.5 text-xs font-semibold text-white">
            Delete account
          </button>
        </form>
      </div>
    </div>
  );
};
