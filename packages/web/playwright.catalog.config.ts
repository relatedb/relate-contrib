import { defineConfig, devices } from "@playwright/test";

const PORT = 5177;

export default defineConfig({
  testDir: "tests/catalog/browser",
  testMatch: "**/*.spec.ts",
  timeout: 180_000,
  expect: { timeout: 30_000 },
  workers: 1,
  fullyParallel: false,
  reporter: [["list"], ["json", { outputFile: process.env.REL_REPORT ?? "reports/catalog-playwright.json" }]],
  use: { baseURL: `http://localhost:${PORT}` },
  projects: [
    { name: "chromium", use: { ...devices["Desktop Chrome"] } },
    { name: "firefox", use: { ...devices["Desktop Firefox"] } },
    { name: "webkit", use: { ...devices["Desktop Safari"] } },
  ],
  webServer: {
    command: `pnpm run build && pnpm exec vite --config tests/catalog/browser/harness/vite.config.ts --port ${PORT} --strictPort`,
    url: `http://localhost:${PORT}/index.html`,
    reuseExistingServer: true,
    timeout: 180_000,
  },
});
