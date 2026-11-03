// The conformance check: runs the framework-neutral scenarios against a site that serves the example pages.
// An adapter serves the same pages through its framework and calls `runConformance` for each profile and browser.
// Needs Playwright, an optional peer dependency of the package.
import { existsSync, readFileSync } from "node:fs";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { chromium, firefox, webkit, type Browser, type BrowserContext } from "@playwright/test";
import { scenarios, type BrowserName, type Profile, type Scenario } from "./scenarios.js";

export { scenarios } from "./scenarios.js";
export type { BrowserName, Profile, Scenario } from "./scenarios.js";

const publicDir = [new URL("./example-site/public/", import.meta.url), new URL("../../conformance/example-site/public/", import.meta.url)].find((u) => existsSync(new URL("descriptor.json", u)));
const read = (name: string): unknown => JSON.parse(readFileSync(new URL(name, publicDir), "utf8"));

/** The example site's descriptor and data document (variant a). */
export const exampleDescriptor = read("descriptor.json") as { version: 1; id: string; revision: string; data: { url: string; nodes: number; links: number }; indexes?: Array<{ label: string; property: string }> };
export const exampleDocument = read("graph.json") as { version: 1; revision?: string; nodes: unknown[]; links: unknown[] };

export interface RunOptions {
  /** Where the example pages are served, for example `http://localhost:5175`. */
  baseUrl: string;
  profile: Profile;
  browser: BrowserName;
  /** Extra query string for every page (used to run a deliberately broken variant of the pages). */
  query?: string;
  /** Run only these scenarios. */
  only?: string[];
}

export interface ScenarioResult {
  id: string;
  title: string;
  spec: string[];
  status: "passed" | "failed" | "skipped";
  /** For a failure: the behavior that is broken. */
  behavior?: string;
  error?: string;
}

export interface Report {
  profile: Profile;
  browser: BrowserName;
  results: ScenarioResult[];
  failures: ScenarioResult[];
  passed: boolean;
}

const launchers = { chromium, firefox, webkit };

/** Empty the origin-private file system so that one scenario's stores do not reach the next (see the test fixtures). */
async function clearOpfs(context: BrowserContext, baseUrl: string): Promise<void> {
  const page = await context.newPage();
  try {
    await page.goto(`${baseUrl}/blank.html`);
    for (let attempt = 0; attempt < 25; attempt++) {
      const left = await page.evaluate(async () => {
        const root = await navigator.storage.getDirectory();
        const names: string[] = [];
        for await (const [name] of (root as any).entries()) names.push(name);
        for (const name of names) await root.removeEntry(name, { recursive: true }).catch(() => undefined);
        let remaining = 0;
        for await (const _ of (root as any).entries()) remaining++;
        return remaining;
      });
      if (left === 0) return;
      await page.waitForTimeout(400);
    }
  } finally {
    await page.close();
  }
}

async function withContext<T>(options: RunOptions, shared: { browser: Browser | null }, use: (context: BrowserContext) => Promise<T>): Promise<T> {
  if (options.browser !== "webkit") {
    const context = await shared.browser!.newContext();
    try {
      return await use(context);
    } finally {
      await context.close();
    }
  }
  // WebKit needs a persistent profile for the origin-private file system.
  const profile = mkdtempSync(join(tmpdir(), "related-web-conformance-"));
  const context = await webkit.launchPersistentContext(profile);
  try {
    await clearOpfs(context, options.baseUrl);
    return await use(context);
  } finally {
    await Promise.all(context.pages().map((p) => p.close().catch(() => undefined)));
    await clearOpfs(context, options.baseUrl).catch(() => undefined);
    await context.close();
    rmSync(profile, { recursive: true, force: true });
  }
}

export async function runConformance(options: RunOptions): Promise<Report> {
  const selected = scenarios.filter((s) => !options.only || options.only.includes(s.id));
  const shared: { browser: Browser | null } = { browser: options.browser === "webkit" ? null : await launchers[options.browser].launch() };
  const results: ScenarioResult[] = [];
  try {
    for (const scenario of selected) {
      const base = { id: scenario.id, title: scenario.title, spec: scenario.spec };
      if (!scenario.profiles.includes(options.profile)) {
        results.push({ ...base, status: "skipped" });
        continue;
      }
      try {
        await withContext(options, shared, async (context) => {
          await scenario.run({
            context,
            baseUrl: options.baseUrl,
            profile: options.profile,
            browser: options.browser,
            async open(path, extra, requests) {
              const page = await context.newPage();
              if (requests) page.on("request", (r) => requests.push(r.url()));
              const query = [`navigation=${options.profile}`, extra, options.query].filter(Boolean).join("&");
              await page.goto(`${options.baseUrl}${path}?${query}`);
              return page;
            },
          });
        });
        results.push({ ...base, status: "passed" });
      } catch (e) {
        results.push({ ...base, status: "failed", behavior: scenario.behavior, error: e instanceof Error ? e.message : String(e) });
      }
    }
  } finally {
    await shared.browser?.close();
  }
  const failures = results.filter((r) => r.status === "failed");
  return { profile: options.profile, browser: options.browser, results, failures, passed: failures.length === 0 };
}

/** A report as text, naming each failed scenario's broken behavior. */
export function formatReport(report: Report): string {
  const lines = [`conformance: ${report.browser}, ${report.profile}: ${report.passed ? "passed" : "FAILED"}`];
  for (const r of report.results) {
    lines.push(`  ${r.status.padEnd(7)} ${r.id} ${r.title}`);
    if (r.status === "failed") lines.push(`          broken behavior: ${r.behavior}`, `          ${r.error}`);
  }
  return lines.join("\n");
}
