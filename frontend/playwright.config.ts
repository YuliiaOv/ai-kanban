import { existsSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { defineConfig, devices } from "@playwright/test";

// Load OPENROUTER_API_KEY for the backend and the live AI test.
const envFile = path.resolve(__dirname, "../.env");
if (existsSync(envFile)) {
  process.loadEnvFile(envFile);
}

const PORT = 8001;

export default defineConfig({
  testDir: "./tests",
  timeout: 60_000,
  workers: 1,
  expect: {
    timeout: 10_000,
  },
  use: {
    baseURL: `http://127.0.0.1:${PORT}`,
    trace: "retain-on-failure",
  },
  // Runs the real stack: FastAPI serving the static export, backed by a fresh SQLite file.
  webServer: {
    command: `npm --prefix frontend run build && python -m uvicorn backend.app.main:app --host 127.0.0.1 --port ${PORT}`,
    cwd: "..",
    url: `http://127.0.0.1:${PORT}/api/health`,
    env: { PM_DATABASE_PATH: path.join(tmpdir(), `pm-e2e-${Date.now()}.db`) },
    reuseExistingServer: false,
    timeout: 180_000,
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
});
