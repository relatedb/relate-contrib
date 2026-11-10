import { defineConfig, devices } from "@playwright/test";

const PORT = 5190;

export default defineConfig({
  testDir: "tests/browser",
  testMatch: "**/*.spec.ts",
  timeout: 180_000,
  expect: { timeout: 30_000 },
  workers: 1,
  fullyParallel: false,
  reporter: [["list"], ["json", { outputFile: process.env.REL_REPORT ?? "reports/playwright.json" }]],
  use: { baseURL: `http://127.0.0.1:${PORT}` },
  projects: [
    { name: "chromium", use: { ...devices["Desktop Chrome"] } },
    { name: "firefox", use: { ...devices["Desktop Firefox"] } },
    { name: "webkit", use: { ...devices["Desktop Safari"] } },
  ],
  webServer: {
    command: "pnpm run build && pnpm run preview",
    url: `http://127.0.0.1:${PORT}/`,
    reuseExistingServer: true,
    timeout: 240_000,
  },
});
