// covers-obs: FR-001, FR-002, FR-003, FR-006, FR-007, FR-009, FR-010, SC-001, SC-002, SC-005
import { expect, test } from "../../application/browser/fixtures.js";
import { openHarness, seed, waitStatus } from "../../application/browser/helpers.js";

declare global {
  interface Window {
    seen: Array<Record<string, any>>;
    revisions: Array<Record<string, any>>;
  }
}

/** Make an application client with listeners in place before its worker starts, so that the load is observed. */
async function observed(page: import("@playwright/test").Page, name: string): Promise<void> {
  await openHarness(page);
  await page.evaluate(
    ([n, s]) => {
      window.seen = [];
      window.revisions = [];
      const client = window.app.make({ name: n, version: 1, seed: s });
      client.on("statement", (e: any) => window.seen.push(e));
      client.on("revision", (e: any) => window.revisions.push(e));
    },
    [name, seed] as const,
  );
  await waitStatus(page, "ready");
}

test("a real worker reports its own load, then the page's statements, and counts the writes", async ({ page }) => {
  await observed(page, "obs");
  const loaded = await page.evaluate(() => window.seen.map((e) => ({ origin: e.origin, write: e.write })));
  expect(loaded.length).toBeGreaterThan(0);
  expect(loaded.every((e) => e.origin === "internal")).toBe(true);
  const afterLoad = await page.evaluate(() => window.client!.revision);
  expect(afterLoad).toBe(loaded.filter((e) => e.write).length);
  expect(await page.evaluate(() => window.revisions.at(-1))).toMatchObject({ revision: afterLoad, generation: 1 });

  await page.evaluate(async () => {
    await window.client!.query("CREATE (:T {x: 1})");
    await window.client!.query("MATCH (n) RETURN count(n) AS n");
    await window.client!.query("MATCH (n RETURN");
    await window.client!.run("RETURN 1 AS a").result;
  });
  const mine = await page.evaluate((n) => window.seen.slice(n).map((e) => [e.origin, e.write, e.error !== null]), loaded.length);
  expect(mine).toEqual([
    ["query", true, false],
    ["query", false, false],
    ["query", false, true],
    ["run", false, false],
  ]);
  expect(await page.evaluate(() => window.client!.revision)).toBe(afterLoad + 1);
});

test("the client says what it is once ready", async ({ page }) => {
  await observed(page, "describe");
  expect(await page.evaluate(() => window.client!.info)).toMatchObject({ name: "app-describe", kind: "application", readOnly: false });
  expect(await page.evaluate(() => window.client!.info!.engine)).toMatch(/^\d+\.\d+\.\d+/);
});

test("a client that is not ready has no description, and an unnamed in-memory graph has none of a store", async ({ page }) => {
  await openHarness(page);
  const result = await page.evaluate(async () => {
    const client = window.app.core.createClient({
      engineUrl: window.app.engineUrl,
      navigation: "client-routing",
      graph: { document: { version: 1, nodes: [{ id: "a", labels: ["T"] }], links: [] } },
    } as never);
    const before = client.info;
    await new Promise<void>((resolve) => {
      const check = (): void => (client.status === "ready" ? resolve() : void setTimeout(check, 20));
      check();
    });
    return { before, after: client.info };
  });
  expect(result.before).toBeNull();
  expect(result.after).toMatchObject({ name: null, kind: "memory", readOnly: false });
});

test("a graph with a descriptor and a store is a cache, named by its store", async ({ page }) => {
  await openHarness(page);
  const info = await page.evaluate(async () => {
    const data = { version: 1, nodes: [{ id: "a", labels: ["T"] }, { id: "b", labels: ["T"] }], links: [{ source: "a", target: "b", type: "R" }] };
    const url = URL.createObjectURL(new Blob([JSON.stringify(data)], { type: "application/json" }));
    const descriptor = { version: 1, id: "obscache", revision: "r1", data: { url, nodes: 2, links: 1 } };
    const client = window.app.core.createClient({
      engineUrl: window.app.engineUrl,
      navigation: "multi-page",
      store: true,
      graph: { descriptor },
    } as never);
    await new Promise<void>((resolve) => {
      const check = (): void => (client.status === "ready" || client.status === "failed" ? resolve() : void setTimeout(check, 20));
      check();
    });
    return { status: client.status, info: client.info };
  });
  expect(info.status).toBe("ready");
  expect(info.info).toMatchObject({ name: "rel-obscache", kind: "cache", readOnly: false });
});
