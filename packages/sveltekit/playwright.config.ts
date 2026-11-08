import { defineConfig, devices } from "@playwright/test";

// Each build of the conformance site has its own output directory, SvelteKit working directory and port. The static builds are
// served as files, the Node builds by their own server; `dev` is the development server.
export const BUILDS: Array<{ name: string; navigation: "client-routing" | "multi-page"; adapter: "static" | "node"; dev: boolean; base?: string; port: number }> = [
  { name: "client-routing-static", navigation: "client-routing", adapter: "static", dev: false, port: 5480 },
  { name: "multi-page-static", navigation: "multi-page", adapter: "static", dev: false, port: 5481 },
  { name: "client-routing-node", navigation: "client-routing", adapter: "node", dev: false, port: 5482 },
  { name: "multi-page-node", navigation: "multi-page", adapter: "node", dev: false, port: 5483 },
  { name: "base-path-static", navigation: "client-routing", adapter: "static", dev: false, base: "/docs", port: 5484 },
  // the development server
  { name: "dev", navigation: "client-routing", adapter: "static", dev: true, port: 5485 },
];

// REL_ONLY=client-routing-static,multi-page-static limits the builds that are made and served (a faster loop while developing).
const only = process.env.REL_ONLY?.split(",");

const serve = (b: (typeof BUILDS)[number]) => {
  const env = `NAVIGATION=${b.navigation} ADAPTER=${b.adapter} OUT=build-${b.name}${b.base ? ` BASE=${b.base}` : ""}`;
  if (b.dev) return { command: `cd conformance-site && NAVIGATION=${b.navigation} PORT=${b.port} ./node_modules/.bin/vite dev`, url: `http://127.0.0.1:${b.port}/blank.html`, reuseExistingServer: true, timeout: 600_000 };
  const start = b.adapter === "static" ? `node serve.mjs build-${b.name} ${b.port}${b.base ? ` ${b.base}` : ""}` : `HOST=127.0.0.1 PORT=${b.port} node build-${b.name}`;
  return {
    command: `cd conformance-site && ${env} ./node_modules/.bin/vite build && ${env} ${start}`,
    url: `http://127.0.0.1:${b.port}${b.base ?? ""}/blank.html`,
    reuseExistingServer: true,
    timeout: 600_000,
  };
};

export default defineConfig({
  testDir: "tests/browser",
  testMatch: "**/*.spec.ts",
  timeout: 120_000,
  expect: { timeout: 30_000 },
  workers: 1,
  fullyParallel: false,
  reporter: [["list"], ["json", { outputFile: process.env.REL_REPORT ?? "reports/playwright.json" }]],
  projects: [
    { name: "chromium", use: { ...devices["Desktop Chrome"] } },
    { name: "firefox", use: { ...devices["Desktop Firefox"] } },
    { name: "webkit", use: { ...devices["Desktop Safari"] } },
  ],
  webServer: BUILDS.filter((b) => !only || only.includes(b.name)).map(serve),
});
