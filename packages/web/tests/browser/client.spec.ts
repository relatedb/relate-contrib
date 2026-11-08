// covers: FR-001, FR-002, FR-003, FR-004, FR-005, FR-006, FR-007
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { expect, test } from "./fixtures.js";
import { openHarness, walk } from "./helpers.js";

const ENVELOPE_KEYS = ["columns", "columnTypes", "rows", "stats", "plan", "notifications", "elapsed_ms", "parse_ms", "plan_ms", "execute_ms", "error"]; // the phase timings are the engine's ADR-0491

const smallDoc = { version: 1, nodes: [{ id: "a", labels: ["Page"] }, { id: "b", labels: ["Page"] }, { id: "c" }], links: [{ source: "a", target: "b", type: "T" }] };

test("the page renders and its links work before and while the graph loads", async ({ page }) => {
  await page.goto("/index.html");
  await expect(page.locator("#placeholder")).toBeVisible();
  await expect(page.locator("#to-other")).toBeVisible();
  await page.waitForFunction(() => document.documentElement.dataset.harness === "ready");

  // Start a large load and follow a link while the instance is loading.
  await page.evaluate(() => {
    const rel = (window as any).rel;
    const graph = rel.generateGraph(20000);
    (window as any).client = rel.core.createClient({ engineUrl: rel.engineUrl, graph: { document: graph.document }, navigation: "client-routing" });
    (window as any).initialStatus = (window as any).client.status;
  });
  expect(await page.evaluate(() => (window as any).initialStatus)).toBe("loading");
  await page.click("#to-other");
  await expect(page).toHaveURL(/\/other\.html$/);
});

test("status goes from loading to ready, and a query resolves with the engine's envelope unaltered", async ({ page }) => {
  await openHarness(page);
  const result = await page.evaluate(async (doc) => {
    const rel = (window as any).rel;
    const client = rel.core.createClient({ engineUrl: rel.engineUrl, graph: { document: doc }, navigation: "client-routing" });
    const statuses: string[] = [client.status];
    client.on("status", (e: { status: string }) => statuses.push(e.status));
    await new Promise<void>((resolve) => client.on("status", (e: { status: string }) => e.status === "ready" && resolve()));
    const envelope = await client.query("MATCH (n:Page) RETURN count(n) AS c");
    const bad = await client.query("THIS IS NOT CYPHER");
    return { statuses, generation: client.generation, envelope, bad };
  }, smallDoc);
  expect(result.statuses).toEqual(["loading", "ready"]);
  expect(result.generation).toBe(1);
  expect(result.envelope.rows).toEqual([{ c: 2 }]);
  expect(result.envelope.error).toBeNull();
  expect(Object.keys(result.envelope).every((k) => ENVELOPE_KEYS.includes(k)), Object.keys(result.envelope).join()).toBe(true);
  // An engine error arrives in the envelope; the call still resolves.
  expect(typeof result.bad.error).toBe("string");
});

test("a subscription shows its placeholder, then the rows, with no retry code in the caller", async ({ page }) => {
  await openHarness(page);
  const updates = await page.evaluate(async (doc) => {
    const rel = (window as any).rel;
    const client = rel.core.createClient({ engineUrl: rel.engineUrl, graph: { document: doc }, navigation: "client-routing" });
    const seen: unknown[] = [];
    await new Promise<void>((resolve) => {
      client.subscribe("MATCH (n) RETURN count(n) AS c", null, (u: { rows: unknown }) => {
        seen.push(u);
        if (u.rows) resolve();
      });
    });
    return seen;
  }, smallDoc);
  expect(updates).toEqual([
    { status: "loading", generation: 0, rows: null, error: null },
    { status: "ready", generation: 1, rows: [{ c: 3 }], error: null },
  ]);
});

test("a listener registered for new instances runs before subscriptions on the first instance", async ({ page }) => {
  await openHarness(page);
  const order = await page.evaluate(async (doc) => {
    const rel = (window as any).rel;
    const client = rel.core.createClient({ engineUrl: rel.engineUrl, graph: { document: doc }, navigation: "client-routing" });
    const seen: string[] = [];
    client.onGeneration(async (g: number) => {
      await new Promise((r) => setTimeout(r, 20));
      seen.push(`generation:${g}`);
    });
    await new Promise<void>((resolve) => {
      client.subscribe("RETURN 1 AS n", null, (u: { rows: unknown }) => {
        if (u.rows) {
          seen.push("subscription");
          resolve();
        }
      });
    });
    return seen;
  }, smallDoc);
  expect(order).toEqual(["generation:1", "subscription"]);
});

test("a descriptor and its data document load the graph, resolving the data location against the page", async ({ page }) => {
  await openHarness(page);
  await page.route("**/data/small.json", (route) => route.fulfill({ contentType: "application/json", body: JSON.stringify({ ...smallDoc, revision: "r1" }) }));
  const rows = await page.evaluate(async () => {
    const rel = (window as any).rel;
    const descriptor = { version: 1, id: "small", revision: "r1", data: { url: "/data/small.json", nodes: 3, links: 1 }, indexes: [{ label: "Page", property: "id" }] };
    const client = rel.core.createClient({ engineUrl: rel.engineUrl, graph: { descriptor }, navigation: "client-routing" });
    await new Promise<void>((resolve) => client.on("status", (e: { status: string }) => e.status === "ready" && resolve()));
    return (await client.query("SHOW INDEXES")).rows.map((r: { properties: string[] }) => r.properties);
  });
  expect(rows).toEqual([["id"]]);
});

test("the built package refers to no vendored path", async () => {
  const dist = join(import.meta.dirname, "../../dist");
  const files = walk(dist).filter((f) => f.endsWith(".js"));
  expect(files.length).toBeGreaterThan(0);
  for (const f of files) {
    const text = readFileSync(f, "utf8");
    expect(text, f).not.toMatch(/vendor\/|relate-wasm\/pkg/);
  }
});
