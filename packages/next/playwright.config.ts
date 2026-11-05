import { defineConfig, devices } from "@playwright/test";

// Each build of the conformance site has its own output directory and port. `next build` writes `.next-<name>` (server) or
// `out-<name>` (export); the server forms run `next start`, the export forms a static file server.
export const BUILDS: Array<{ name: string; navigation: string; exported: boolean; cache: boolean; dev: boolean; base?: string; port: number }> = [
  { name: "client-routing", navigation: "client-routing", exported: false, cache: false, dev: false, port: 5280 },
  { name: "multi-page", navigation: "multi-page", exported: false, cache: false, dev: false, port: 5281 },
  { name: "client-routing-export", navigation: "client-routing", exported: true, cache: false, dev: false, port: 5282 },
  { name: "multi-page-export", navigation: "multi-page", exported: true, cache: false, dev: false, port: 5283 },
  // a base path
  { name: "base-path", navigation: "client-routing", exported: false, cache: false, dev: false, base: "/docs", port: 5286 },
  { name: "client-routing-cache", navigation: "client-routing", exported: false, cache: true, dev: false, port: 5284 },
  // the development server, where React runs effects twice (strict mode)
  { name: "dev", navigation: "client-routing", exported: false, cache: false, dev: true, port: 5285 },
];

// GW_ONLY=client-routing,multi-page limits the builds that are made and served (a faster loop while developing).
const only = process.env.GW_ONLY?.split(",");

const serve = (b: (typeof BUILDS)[number]) => {
  const env = `NAVIGATION=${b.navigation} BUILD_NAME=${b.name}${b.base ? ` BASE_PATH=${b.base}` : ""}${b.exported ? " EXPORT=1" : ""}${b.cache ? " CACHE_COMPONENTS=1" : ""}`;
  if (b.dev) return { command: `cd conformance-site && ${env} ./node_modules/.bin/next dev -p ${b.port}`, url: `http://127.0.0.1:${b.port}/blank.html`, reuseExistingServer: true, timeout: 600_000 };
  const start = b.exported ? `node serve.mjs out-${b.name} ${b.port}` : `./node_modules/.bin/next start -p ${b.port}`;
  // the cache build is made from copies of the route and recipe files without the settings `cacheComponents` refuses
  const build = b.cache
    ? `node variant.mjs cache && ${env} ./node_modules/.bin/next build; status=$?; node variant.mjs standard; [ $status -eq 0 ]`
    : `${env} ./node_modules/.bin/next build`;
  return {
    command: `cd conformance-site && ${build} && ${env} ${start}`,
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
  reporter: [["list"], ["json", { outputFile: process.env.GW_REPORT ?? "reports/playwright.json" }]],
  projects: [
    { name: "chromium", use: { ...devices["Desktop Chrome"] } },
    { name: "firefox", use: { ...devices["Desktop Firefox"] } },
    { name: "webkit", use: { ...devices["Desktop Safari"] } },
  ],
  webServer: BUILDS.filter((b) => !only || only.includes(b.name)).map(serve),
});
