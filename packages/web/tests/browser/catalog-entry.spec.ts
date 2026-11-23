// covers: FR-023, FR-037, FR-038, SC-013
// The record of what a content cache holds is its entry in the catalog (ADR-010 2.4), which replaced the stored copy of
// ADR-003. The behaviour these tests check is the one the stored copy had.
import { expect, test } from "./fixtures.js";
import { catalogEntry, opfsRoot, query, restored, visitSite } from "./helpers.js";

test("a matching revision restores the graph with no request for the data document, and its index is kept", async ({ page, context }) => {
  const first = await visitSite(page, { id: "restore", pages: 300, revision: "r1" });
  expect(first.dataRequests).toHaveLength(1);
  expect(await restored(page)).toBe(false);
  expect(await query(page, "MATCH (n:Page) RETURN count(n) AS c")).toEqual([{ c: 300 }]);
  await page.close();

  const second = await context.newPage();
  const visit = await visitSite(second, { id: "restore", pages: 300, revision: "r1" });
  expect(visit.dataRequests).toHaveLength(0);
  expect(await restored(second)).toBe(true);
  expect(await query(second, "MATCH (n:Page) RETURN count(n) AS c")).toEqual([{ c: 300 }]);
  expect(await query(second, "SHOW INDEXES WHERE type <> 'LOOKUP'")).toHaveLength(1);
  expect(await query(second, "MATCH ()-[r:LINKS_TO]->() RETURN count(r) AS c")).toEqual([{ c: 1500 }]);
});

test("no bookkeeping node is in the graph, before or after a restore", async ({ page, context }) => {
  await visitSite(page, { id: "clean", pages: 100, revision: "r1" });
  const nodes = await query(page, "MATCH (n) WHERE n.scope IS NULL RETURN count(n) AS c, collect(DISTINCT labels(n)) AS labels");
  expect(nodes).toEqual([{ c: 100, labels: [["Page"]] }]);
  await page.close();
  const again = await context.newPage();
  await visitSite(again, { id: "clean", pages: 100, revision: "r1" });
  expect(await query(again, "MATCH (n) WHERE n.scope IS NULL RETURN count(n) AS c, collect(DISTINCT labels(n)) AS labels")).toEqual(nodes);
});

test("the entry is written loading before a reset and ready last: an interrupted load leaves loading", async ({ page, context }) => {
  await visitSite(page, { id: "copy", pages: 100, revision: "r1" });
  expect(await catalogEntry(page, "rel-copy")).toMatchObject({ kind: "cache", state: "ready", revision: "r1" });
  await page.close();

  // A new revision whose data never arrives: the entry must say loading while the load is under way.
  const interrupted = await context.newPage();
  await visitSite(interrupted, { id: "copy", pages: 100, revision: "r2", hang: true });
  await expect.poll(() => catalogEntry(interrupted, "rel-copy").then((e) => e?.state), { timeout: 20_000 }).toBe("loading");
  await interrupted.close();

  // The next visit finds the loading entry, loads, and writes ready last. If the interrupted page's worker still holds
  // the store (a browser may take several seconds to release it), the visit loads in memory and writes nothing,
  // so wait for the store to be free and visit again.
  let entry: { state?: string; revision?: string } | null = null;
  for (let attempt = 0; attempt < 4 && !(entry?.state === "ready" && entry.revision === "r2"); attempt++) {
    const next = await context.newPage();
    await visitSite(next, { id: "copy", pages: 100, revision: "r2" });
    expect(await restored(next)).toBe(false);
    entry = await catalogEntry(next, "rel-copy");
    await next.close();
    if (!(entry?.state === "ready" && entry.revision === "r2")) await new Promise((r) => setTimeout(r, 6000));
  }
  expect(entry).toMatchObject({ state: "ready", revision: "r2" });
});

test("a store that holds fewer nodes than its descriptor says is treated as stale and loaded again", async ({ page, context }) => {
  await visitSite(page, { id: "wiped", pages: 200, revision: "r1" });
  await page.close();

  // Wipe the engine's store directory but leave the catalog entry.
  const tool = await context.newPage();
  await tool.goto("/other.html");
  await expect
    .poll(
      () =>
        tool.evaluate(async () => {
          try {
            const root = await navigator.storage.getDirectory();
            const engine = await root.getDirectoryHandle("relate");
            await engine.removeEntry("rel-wiped", { recursive: true });
            return "removed";
          } catch (e) {
            return String(e);
          }
        }),
      { timeout: 20_000 },
    )
    .toBe("removed");
  expect(await catalogEntry(tool, "rel-wiped")).toMatchObject({ state: "ready", revision: "r1" });
  await tool.close();

  const again = await context.newPage();
  const visit = await visitSite(again, { id: "wiped", pages: 200, revision: "r1" });
  expect(await restored(again)).toBe(false);
  expect(visit.dataRequests).toHaveLength(1);
  expect(await query(again, "MATCH (n:Page) RETURN count(n) AS c")).toEqual([{ c: 200 }]);
});

test("a graph without a descriptor never uses a store", async ({ page }) => {
  await visitSite(page, { id: "plain", pages: 100, graph: "document" });
  expect(await query(page, "MATCH (n:Page) RETURN count(n) AS c")).toEqual([{ c: 100 }]);
  expect(await restored(page)).toBe(false);
  const root = await opfsRoot(page);
  expect(root).not.toContain("relate-web");
  expect(root).not.toContain("relate");
});
