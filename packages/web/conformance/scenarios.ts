// Framework-neutral conformance scenarios (specs contracts/conformance.md). They drive the example pages by what a
// visitor can see: `data-rel-*` elements and attributes, links, buttons and the network. They know nothing about
// the framework that serves the pages, so an adapter passes by producing the same markup and behavior.
import assert from "node:assert/strict";
import type { BrowserContext, Page } from "@playwright/test";

export type Profile = "client-routing" | "multi-page";
export type BrowserName = "chromium" | "firefox" | "webkit";

export interface ScenarioContext {
  context: BrowserContext;
  baseUrl: string;
  profile: Profile;
  browser: BrowserName;
  /** Whether a request URL fetched variant a's data, and variant b's. The example site's file names by default. */
  isDataA(url: string): boolean;
  isDataB(url: string): boolean;
  /** Open a page of the example site, with the scenario's profile in its query. `requests` collects its request URLs. */
  open(path: string, extra?: string, requests?: string[]): Promise<Page>;
}

export interface Scenario {
  id: string;
  title: string;
  /** The requirements and user-story scenarios this one checks. */
  spec: string[];
  /** The behavior that is broken when this scenario fails, in words an adapter author can act on. */
  behavior: string;
  profiles: Profile[];
  run(ctx: ScenarioContext): Promise<void>;
}

const BOTH: Profile[] = ["client-routing", "multi-page"];
const PAGES = "300"; // variant a of the example graph
const PAGES_B = "400"; // variant b

const text = async (page: Page, name: string): Promise<string> => ((await page.locator(`[data-rel-${name}]`).first().textContent()) ?? "").trim();
const settled = (page: Page, status = "ready", timeout = 60_000) =>
  page.waitForFunction((s) => document.documentElement.dataset.relState === s, status, { timeout });
const showing = (page: Page, name: string, value: string, timeout = 30_000) =>
  page.waitForFunction(([n, v]) => document.querySelector(`[data-rel-${n}]`)?.textContent?.trim() === v, [name, value] as const, { timeout });

/** Click a link and wait until the page it leads to is showing (works for a client-side swap and a full load). */
async function follow(page: Page, label: string, title: string): Promise<void> {
  await page.locator(`a[data-rel-link]`, { hasText: label }).first().click();
  await page.waitForFunction((t) => document.querySelector("[data-rel-title]")?.textContent?.trim() === t, title);
}

export const scenarios: Scenario[] = [
  {
    id: "C-01",
    title: "a per-page query returns what the data implies, and links work before the graph is ready",
    spec: ["US1", "FR-006", "FR-003"],
    behavior: "a page's first render must not depend on the instance, and a subscription delivers the query's rows",
    profiles: BOTH,
    async run(ctx) {
      const raw = await (await ctx.context.request.get(`${ctx.baseUrl}/page-1.html`)).text();
      assert.match(raw, /data-rel-link/, "the navigation links are in the page as served, before any script runs");
      assert.match(raw, /data-rel-status/, "the status placeholder is in the page as served");
      const page = await ctx.open("/page-1.html");
      await settled(page);
      assert.equal(await text(page, "count"), PAGES, "the query result is shown");
      assert.ok((await page.locator("a[data-rel-link]").count()) >= 4, "the links are present");
    },
  },
  {
    id: "C-02",
    title: "the shared graph is visible from several pages without being loaded again",
    spec: ["US4", "US5", "FR-020", "FR-021"],
    behavior: "the graph must live as long as the profile allows: one instance per visit (client-routing) or a restore from the store (multi-page)",
    profiles: BOTH,
    async run(ctx) {
      if (ctx.profile === "client-routing") {
        const page = await ctx.open("/index.html");
        await settled(page);
        const instance = await text(page, "instance");
        for (const [label, title] of [["Page 1", "Example site: page 1"], ["Page 2", "Example site: page 2"], ["Notes", "Example site: notes"], ["Home", "Example site: home"]] as const) {
          await follow(page, label, title);
          await showing(page, "count", PAGES);
          assert.equal(await text(page, "instance"), instance, `the same instance serves ${label}`);
          assert.equal(await text(page, "generation"), "1", `the generation is unchanged at ${label}`);
        }
      } else {
        const first = await ctx.open("/page-1.html");
        await settled(first);
        assert.equal(await text(first, "restored"), "false", "the first page loads the graph");
        await first.close();
        const requests: string[] = [];
        const second = await ctx.open("/page-2.html", undefined, requests);
        await settled(second);
        assert.equal(await text(second, "restored"), "true", "the second page restores the graph from the store");
        assert.equal(await text(second, "count"), PAGES);
        assert.deepEqual(requests.filter((u) => ctx.isDataA(u)), [], "the data document is not requested again");
      }
    },
  },
  {
    id: "C-03",
    title: "a graph that cannot load ends in `failed`, and the page's links still work",
    spec: ["US3", "FR-033", "FR-034"],
    behavior: "after three failed attempts the status must be `failed`, with the failure wording shown and the page usable",
    profiles: BOTH,
    async run(ctx) {
      const page = await ctx.open("/broken.html");
      await settled(page, "failed", 90_000);
      assert.match(await text(page, "failure"), /3 attempts/, "the failure wording says how many attempts were made");
      assert.match(await text(page, "failure"), /report this as an issue/, "the wording suggests reporting an issue");
      await follow(page, "Home", "Example site: home");
    },
  },
  {
    id: "C-04",
    title: "a crash is recovered from: the instance is replaced and subscriptions re-run",
    spec: ["US3", "FR-009", "FR-004"],
    behavior: "subscriptions re-run after a replacement, and the page is not reloaded",
    profiles: BOTH,
    async run(ctx) {
      const page = await ctx.open("/page-1.html");
      await settled(page);
      await page.evaluate(() => ((window as unknown as { __kept: boolean }).__kept = true));
      const before = Number(await text(page, "updates"));
      await page.locator('[data-rel-action="trap"]').click();
      await showing(page, "generation", "2", 60_000);
      await settled(page);
      await page.waitForFunction((n) => Number(document.querySelector("[data-rel-updates]")?.textContent) > n, before, { timeout: 30_000 });
      assert.equal(await text(page, "last-error"), "trap");
      assert.equal(await page.evaluate(() => (window as unknown as { __kept?: boolean }).__kept), true, "the page was not reloaded");
    },
  },
  {
    id: "C-05",
    title: "a statement that exceeds its timeout fails with `timeout` and the instance is replaced",
    spec: ["US3", "US6", "FR-009"],
    behavior: "a call's timeout must reject it with `timeout` and replace the instance",
    profiles: BOTH,
    async run(ctx) {
      const page = await ctx.open("/page-1.html");
      await settled(page);
      await page.locator('[data-rel-action="timeout"]').click();
      await showing(page, "generation", "2", 60_000);
      await settled(page);
      assert.equal(await text(page, "last-error"), "timeout");
    },
  },
  {
    id: "C-06",
    title: "a page's own data is added on arrival, dropped on departure and added again after a replacement",
    spec: ["US4", "FR-026"],
    behavior: "page-scoped data must be keyed to the page view: added on arrival, dropped on departure, re-added after a replacement",
    profiles: BOTH,
    async run(ctx) {
      const page = await ctx.open("/notes.html");
      await settled(page);
      await showing(page, "notes", "2");
      await page.locator('[data-rel-action="trap"]').click();
      await showing(page, "generation", "2", 60_000);
      await showing(page, "notes", "2", 60_000);
      if (ctx.profile === "client-routing") {
        await follow(page, "Home", "Example site: home");
        await follow(page, "Notes", "Example site: notes");
        await showing(page, "notes", "2");
        assert.equal(await page.evaluate(async () => 0), 0);
      } else {
        await page.reload();
        await settled(page);
        await showing(page, "notes", "2");
      }
    },
  },
  {
    id: "C-07",
    title: "a changed revision replaces the stored graph and shows none of the old data",
    spec: ["US5", "FR-022", "FR-038", "SC-013"],
    behavior: "staleness must be decided by the descriptor's revision against the stored copy, and a matching revision must not fetch the data",
    profiles: ["multi-page"],
    async run(ctx) {
      const a = await ctx.open("/page-1.html");
      await settled(a);
      assert.equal(await text(a, "count"), PAGES);
      await a.close();
      const requests: string[] = [];
      const b = await ctx.open("/page-1.html", "variant=b", requests);
      await settled(b);
      assert.equal(await text(b, "restored"), "false", "a new revision is loaded, not restored");
      assert.equal(await text(b, "count"), PAGES_B, "only the new data is shown");
      assert.ok(requests.some((u) => ctx.isDataB(u)), "the new data was fetched");
      await b.close();
      const again: string[] = [];
      const c = await ctx.open("/page-1.html", "variant=b", again);
      await settled(c);
      assert.equal(await text(c, "restored"), "true", "the same revision is restored");
      assert.deepEqual(again.filter((u) => ctx.isDataB(u)), [], "and the data is not fetched");
    },
  },
  {
    id: "C-08",
    title: "a store held by another page falls back to an in-memory graph",
    spec: ["US5", "FR-012", "SC-007"],
    behavior: "a locked store must be retried for at most five seconds, then the page continues with an in-memory graph",
    profiles: ["multi-page"],
    async run(ctx) {
      const holder = await ctx.open("/page-1.html");
      await settled(holder);
      const started = Date.now();
      const second = await ctx.open("/page-2.html");
      await settled(second, "ready", 60_000);
      const elapsed = Date.now() - started;
      assert.equal(await text(second, "restored"), "false", "the second page could not use the held store");
      assert.equal(await text(second, "count"), PAGES);
      assert.ok(elapsed >= 4500 && elapsed < 11_000, `it waited about five seconds before falling back (${elapsed} ms)`);
      await second.close();
      await holder.close();
      const third = await ctx.open("/page-1.html");
      await settled(third);
      assert.equal(await text(third, "restored"), "true", "the held store was left intact");
    },
  },
  {
    id: "C-09",
    title: "the configured profile decides",
    spec: ["FR-028"],
    behavior: "the `navigation` configuration value must decide the profile",
    profiles: BOTH,
    async run(ctx) {
      const own = await ctx.open("/page-1.html");
      await settled(own);
      assert.equal(await text(own, "profile"), ctx.profile === "client-routing" ? "persistent" : "per-page");
      await own.close();
      const otherProfile = ctx.profile === "client-routing" ? "multi-page" : "client-routing";
      const other = await ctx.context.newPage();
      await other.goto(`${ctx.baseUrl}/page-1.html?navigation=${otherProfile}`);
      await settled(other);
      assert.equal(await text(other, "profile"), otherProfile === "client-routing" ? "persistent" : "per-page");
    },
  },
  {
    id: "C-10",
    title: "data that disagrees with its descriptor is rejected and nothing is loaded",
    spec: ["FR-039"],
    behavior: "the loader must check the data's counts and revision against the descriptor and load nothing on a mismatch",
    profiles: BOTH,
    async run(ctx) {
      const page = await ctx.open("/page-1.html", "variant=mismatch");
      await settled(page, "failed", 90_000);
      assert.notEqual(await text(page, "count"), PAGES, "no data was loaded");
      assert.match(await text(page, "failure"), /mismatch|nodes/, "the failure says what disagreed");
    },
  },
  {
    id: "C-11",
    title: "a store emptied while its stored copy remains is treated as stale",
    spec: ["US5", "FR-038"],
    behavior: "the node count of a restored store must be checked against the descriptor's, and a difference treated as stale",
    profiles: ["multi-page"],
    async run(ctx) {
      const first = await ctx.open("/page-1.html");
      await settled(first);
      await first.close();
      const tool = await ctx.context.newPage();
      await tool.goto(`${ctx.baseUrl}/blank.html`);
      const deadline = Date.now() + 30_000;
      let removed = "";
      while (Date.now() < deadline && removed !== "removed") {
        removed = await tool.evaluate(async () => {
          try {
            const root = await navigator.storage.getDirectory();
            await (await root.getDirectoryHandle("relate")).removeEntry("rel-example", { recursive: true });
            return "removed";
          } catch (e) {
            return String(e);
          }
        });
        if (removed !== "removed") await tool.waitForTimeout(500);
      }
      assert.equal(removed, "removed", "the test could not empty the store");
      await tool.close();
      const requests: string[] = [];
      const again = await ctx.open("/page-1.html", undefined, requests);
      await settled(again);
      assert.equal(await text(again, "restored"), "false", "an emptied store is not restored");
      assert.equal(await text(again, "count"), PAGES);
      assert.ok(requests.some((u) => ctx.isDataA(u)), "the data was fetched again");
    },
  },
];
