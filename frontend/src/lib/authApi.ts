import { jsonBody, request } from "@/lib/api";

export type User = {
  id: string;
  username: string;
  display_name: string;
};

// Mirrors check_password_strength in backend/app/auth.py, so users see the problem before submitting.
export const PASSWORD_RULES =
  "Password must be at least 8 characters and include an uppercase letter, a lowercase letter, a number, and a special character.";

export const isStrongPassword = (password: string) =>
  password.length >= 8 && [/[A-Z]/, /[a-z]/, /[0-9]/, /[^A-Za-z0-9]/].every((rule) => rule.test(password));

export const fetchMe = () => request<User>("/api/auth/me");

export const login = (username: string, password: string) =>
  request<User>("/api/auth/login", jsonBody("POST", { username, password }));

export const register = (username: string, password: string, displayName: string) =>
  request<User>(
    "/api/auth/register",
    jsonBody("POST", { username, password, display_name: displayName })
  );

export const logout = () => request("/api/auth/logout", jsonBody("POST"));

export const updateProfile = (displayName: string) =>
  request<User>("/api/auth/me", jsonBody("PATCH", { display_name: displayName }));

export const changePassword = (currentPassword: string, newPassword: string) =>
  request(
    "/api/auth/password",
    jsonBody("POST", { current_password: currentPassword, new_password: newPassword })
  );

export const deleteAccount = (password: string) =>
  request("/api/auth/me", jsonBody("DELETE", { password }));
