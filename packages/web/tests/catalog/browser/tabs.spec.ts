// covers-cat: FR-005, FR-006, SC-002, SC-003
import { entry } from "./catalog-file.js";
import { expect, test } from "./fixtures.js";
import { count, openHarness, openReady, rows, seed } from "./helpers.js";

test("three tabs each making 100 catalog changes at once lose none", async ({ context, page }) => {
  const pages = [page, await context.newPage(), await context.newPage()];
  for (const p of pages) await openHarness(p);
  await pages[0]!.evaluate(async () => {
    const catalog = new window.app.Catalog(new window.app.OpfsCatalogStorage());
    await catalog.set("app-counter", { kind: "application", name: "counter", state: "ready", version: 1, seeded: true });
  });
  await Promise.all(
    pages.map((p) =>
      p.evaluate(async () => {
        const catalog = new window.app.Catalog(new window.app.OpfsCatalogStorage());
        for (let i = 0; i < 100; i++) {
          await catalog.update("app-counter", (current) => ({ kind: "application", name: "counter", state: "ready", version: (current as { version: number }).version + 1, seeded: true }));
        }
      }),
    ),
  );
  expect((await entry(page, "app-counter"))?.version).toBe(301);
});

test("a reader looping while a writer replaces the catalog 300 times sees no torn, missing or failed read", async ({ context, page }) => {
  const reader = await context.newPage();
  await openHarness(page);
  await openHarness(reader);
  await page.evaluate(async () => {
    const catalog = new window.app.Catalog(new window.app.OpfsCatalogStorage());
    await catalog.set("app-counter", { kind: "application", name: "counter", state: "ready", version: 1, seeded: true });
  });
  const reading = reader.evaluate(async () => {
    const catalog = new window.app.Catalog(new window.app.OpfsCatalogStorage());
    let reads = 0;
    const bad: string[] = [];
    (window as unknown as { stop: boolean }).stop = false;
    while (!(window as unknown as { stop: boolean }).stop) {
      try {
        const r = await catalog.read();
        reads++;
        if (r.status !== "ok") bad.push(r.status);
      } catch (e) {
        bad.push(String(e).slice(0, 80));
      }
    }
    return { reads, bad };
  });
  await page.waitForTimeout(100);
  await page.evaluate(async () => {
    const catalog = new window.app.Catalog(new window.app.OpfsCatalogStorage());
    for (let i = 0; i < 300; i++) {
      await catalog.update("app-counter", (current) => ({ kind: "application", name: "counter", state: "ready", version: (current as { version: number }).version + 1, seeded: true }));
    }
  });
  await reader.evaluate(() => void ((window as unknown as { stop: boolean }).stop = true));
  const result = await reading;
  expect(result.reads).toBeGreaterThan(0);
  expect(result.bad).toEqual([]);
  expect((await entry(page, "app-counter"))?.version).toBe(301);
});

test("the catalog is readable and another graph's entry writable while one tab holds a store, and the holder keeps working", async ({ context, page }) => {
  await openReady(page, { name: "held", version: 1, seed });
  const other = await context.newPage();
  await openHarness(other, "/other.html");
  const outcome = await other.evaluate(async () => {
    const catalog = new window.app.Catalog(new window.app.OpfsCatalogStorage());
    const before = await catalog.read();
    await catalog.set("rel-elsewhere", { kind: "cache", name: "elsewhere", state: "ready", revision: "r1" });
    const after = await catalog.read();
    return { before: before.status, after: after.status, graphs: after.status === "ok" ? Object.keys(after.file.graphs).sort() : [] };
  });
  expect(outcome.before).toBe("ok");
  expect(outcome.after).toBe("ok");
  expect(outcome.graphs).toEqual(["app-held", "rel-elsewhere"]);
  expect(await count(page, "MATCH (p:Person) RETURN count(p) AS c")).toBe(3);
  await rows(page, "CREATE (:Person {id: 'later', name: 'Later'})");
  expect(await count(page, "MATCH (p:Person) RETURN count(p) AS c")).toBe(4);
});
