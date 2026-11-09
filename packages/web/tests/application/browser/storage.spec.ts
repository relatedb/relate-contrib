// covers-app: FR-014, FR-015, FR-016, FR-017, FR-018, FR-019, FR-020, SC-005, SC-009
import { expect, test, ephemeral } from "./fixtures.js";
import { count, diagnostic, itemSeed, makeClient, openHarness, openReady, record, rows, seed, status, storage, waitStatus } from "./helpers.js";

const app = (over: Record<string, unknown> = {}) => ({ name: "stor", version: 1, seed, ...over });

test("a second tab waits while the first holds the store, never writes, and proceeds when the first closes", async ({ context, page }, info) => {
  await openReady(page, app());
  const before = await count(page, "MATCH (n) RETURN count(n) AS c");

  const second = await context.newPage();
  await openHarness(second);
  await second.evaluate((a) => {
    const w = window as unknown as { log: unknown[]; pending: string };
    w.log = [];
    w.pending = "pending";
    const client = window.app.make(a as never);
    client.on("storage", (s) => w.log.push(s));
    client.query("MATCH (p:Person) RETURN count(p) AS c").then(
      () => (w.pending = "resolved"),
      () => (w.pending = "rejected"),
    );
  }, app());
  const t0 = Date.now();
  // before the worker reports, `waiting` has no reason (nothing has been opened yet); the reason is the report
  await second.waitForFunction(() => window.client!.storage.reason === "locked", null, { timeout: 30_000 });
  const waitingAfterMs = Date.now() - t0;
  expect(await storage(second)).toMatchObject({ kind: "waiting", reason: "locked" });
  expect(await status(second)).toBe("loading");
  // placeholder, with the page's own text and link intact (SC-009, FR-020)
  await expect(second.locator("#region")).toContainText("placeholder");
  await expect(second.locator("nav a")).toHaveAttribute("href", "/other.html");
  await second.waitForTimeout(3000);
  expect(await second.evaluate(() => (window as unknown as { pending: string }).pending)).toBe("pending");
  expect(await count(page, "MATCH (n) RETURN count(n) AS c")).toBe(before);

  const closedAt = Date.now();
  await page.close();
  await second.waitForFunction(() => window.client!.status === "ready", null, { timeout: 30_000 });
  const proceededAfterMs = Date.now() - closedAt;
  expect(await storage(second)).toMatchObject({ kind: "durable" });
  expect(await second.evaluate(() => (window as unknown as { pending: string }).pending)).toBe("resolved");
  const log = await second.evaluate(() => (window as unknown as { log: Array<{ kind: string }> }).log);
  // the event also fires when `persisted` becomes known, so compare the kinds without repeats
  expect([...new Set(log.map((s) => s.kind))]).toEqual(["waiting", "durable"]);
  expect(await count(second, "MATCH (n) RETURN count(n) AS c")).toBe(before);
  record(info, "storage", "second-tab", { waitingReportedAfterMs: waitingAfterMs, proceededAfterFirstClosedMs: proceededAfterMs });
});

test("whenLocked memory runs in memory with reason locked and writes nothing to the store", async ({ context, page }) => {
  await openReady(page, app());
  const second = await context.newPage();
  await openHarness(second);
  await makeClient(second, app({ whenLocked: "memory" }));
  await waitStatus(second, "ready");
  expect(await storage(second)).toMatchObject({ kind: "memory", reason: "locked" });
  await rows(second, "CREATE (:Person {id: 'lost', name: 'Not stored'})");
  await second.close();
  await page.close();
  const third = await context.newPage();
  await openReady(third, app());
  expect(await count(third, "MATCH (p:Person {id: 'lost'}) RETURN count(p) AS c")).toBe(0);
});

test("a browser with no store runs in memory with the seed, or fails with onUnavailable fail", async ({ page }) => {
  await openHarness(page);
  await page.evaluate((a) => void window.app.make(a as never, { workerFactory: window.app.noStoreWorker() }), app());
  await waitStatus(page, "ready");
  expect(await storage(page)).toMatchObject({ kind: "memory", reason: "unavailable" });
  expect(await count(page, "MATCH (p:Person) RETURN count(p) AS c")).toBe(3);
  await page.evaluate(() => window.client!.destroy());

  await openHarness(page);
  await page.evaluate((a) => void window.app.make({ ...(a as object), onUnavailable: "fail" } as never, { workerFactory: window.app.noStoreWorker() }), app());
  await waitStatus(page, "failed");
  expect((await diagnostic(page))?.reason).toBe("unavailable");
});

test("an open error fails store-unreadable with the engine's message, or runs in memory with onError memory", async ({ page }, info) => {
  await openReady(page, app({ name: "broken" }));
  await rows(page, "CREATE (:Person {id: 'v', name: 'Visitor'})");
  await page.evaluate(() => window.client!.destroy());
  await page.waitForTimeout(800);
  // damage every file of the store, from the page (no worker holds it now)
  const damaged = await page.evaluate(async () => {
    const root = await navigator.storage.getDirectory();
    const dir = await (await root.getDirectoryHandle("relate")).getDirectoryHandle("app-broken"); // the engine keeps a store at relate/app-<name>/slot-N
    let n = 0;
    const walk = async (d: FileSystemDirectoryHandle): Promise<void> => {
      for await (const [, h] of (d as any).entries()) {
        if (h.kind === "directory") await walk(h);
        else {
          try {
            const w = await h.createWritable();
            await w.write(new Uint8Array(64).fill(7));
            await w.close();
            n++;
          } catch {
            /* a file the browser will not let the page write */
          }
        }
      }
    };
    await walk(dir);
    return n;
  });
  test.skip(damaged === 0, "this browser does not let the page damage the store's files");
  await openHarness(page);
  await makeClient(page, app({ name: "broken" }));
  await page.waitForFunction(() => ["ready", "failed"].includes(window.client!.status), null, { timeout: 60_000 });
  const d = await diagnostic(page);
  record(info, "open-errors", "damaged-store", { status: await status(page), reason: d?.reason ?? null, message: d?.engineError ?? null });
  if ((await status(page)) === "failed") {
    expect(d?.reason).toBe("store-unreadable");
    expect(d?.engineError).toBeTruthy();
    await openHarness(page);
    await makeClient(page, app({ name: "broken", onError: "memory" }));
    await waitStatus(page, "ready");
    expect(await storage(page)).toMatchObject({ kind: "memory", reason: "error" });
  }
});

test("the core never asks for persistent storage; requestPersistence asks once and does not delay ready", async ({ page }, info) => {
  await page.addInitScript(() => {
    const w = window as unknown as { persistCalls: number };
    w.persistCalls = 0;
    const original = navigator.storage.persist?.bind(navigator.storage);
    navigator.storage.persist = () => {
      w.persistCalls++;
      return original ? original() : Promise.resolve(false);
    };
  });
  await openReady(page, app());
  expect(await page.evaluate(() => (window as unknown as { persistCalls: number }).persistCalls)).toBe(0);
  // Firefox answers with a permission prompt nobody sees here, so the call may stay pending: never await it unbounded.
  const outcome = await page.evaluate(async () => {
    const asked = window.client!.requestPersistence();
    return Promise.race([asked.then((g) => (g ? "granted" : "refused")), new Promise<string>((r) => setTimeout(() => r("pending (prompt)"), 3000))]);
  });
  record(info, "storage", "request-persistence", outcome);
  expect(["granted", "refused", "pending (prompt)"]).toContain(outcome);
  expect(await status(page)).toBe("ready");
  expect(await page.evaluate(() => (window as unknown as { persistCalls: number }).persistCalls)).toBe(1);
  const estimate = await page.evaluate(() => window.client!.storageEstimate());
  expect(typeof estimate.quota === "number" || estimate.quota === null).toBe(true);
  expect(typeof estimate.usage === "number" || estimate.usage === null).toBe(true);
  expect(["boolean", "object"]).toContain(typeof (await storage(page)).persisted);
});

test("a failed client keeps the page's text and links and shows a message in the graph region", async ({ page }) => {
  await openHarness(page);
  await makeClient(page, app({ seed: { version: 1, nodes: [{ id: "m", labels: ["_RelateApplication"] }], links: [] } }));
  await waitStatus(page, "failed");
  await expect(page.locator("#region")).toContainText("failed");
  await expect(page.locator("h1")).toHaveText("Application harness");
  await expect(page.locator("nav a")).toHaveAttribute("href", "/other.html");
});

test("memory mode never writes to the store", async ({ page }) => {
  await openHarness(page);
  await page.evaluate((a) => void window.app.make(a as never, { workerFactory: window.app.noStoreWorker() }), app({ name: "memonly" }));
  await waitStatus(page, "ready");
  await rows(page, "CREATE (:Person {id: 'm', name: 'Memory'})");
  const listed = await page.evaluate(async () => {
    try {
      const root = await (await navigator.storage.getDirectory()).getDirectoryHandle("relate");
      const names: string[] = [];
      for await (const [name] of (root as any).entries()) names.push(name);
      return names;
    } catch {
      return [] as string[];
    }
  });
  expect(listed.filter((n) => n.startsWith("app-"))).toEqual([]);
  void itemSeed;
});

ephemeral("WebKit's default context has no store: the client says so and keeps working in memory", async ({ page, browserName }) => {
  ephemeral.skip(browserName !== "webkit", "only WebKit's default context lacks the origin-private file system");
  await openHarness(page);
  await makeClient(page, app({ name: "eph" }));
  await waitStatus(page, "ready");
  expect(await storage(page)).toMatchObject({ kind: "memory", reason: "unavailable" });
  expect(await count(page, "MATCH (p:Person) RETURN count(p) AS c")).toBe(3);
});
