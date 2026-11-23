// covers-app: FR-026, SC-008
import { RUNAWAY, count, makeBulk, makeClient, openHarness, openReady, record, rows, seed, storage, waitStatus } from "./helpers.js";
import { expect, test } from "./fixtures.js";

const app = (over: Record<string, unknown> = {}) => ({ name: "items", version: 1, seed, indexes: [{ label: "Person", property: "name" }], ...over });

test("(a) the reopen sequence after a replaced worker, with a busy worker", async ({ page }, info) => {
  await openReady(page, app());
  await makeBulk(page);
  const result = await page.evaluate(async (runaway) => {
    const client = window.client!;
    const log: Array<{ at: number; event: string }> = [];
    const t0 = performance.now();
    const mark = (event: string): void => void log.push({ at: Math.round(performance.now() - t0), event });
    client.on("status", (s) => mark(`status ${s.status} (generation ${s.generation})`));
    client.on("storage", (s) => mark(`storage ${s.kind}${s.reason ? "/" + s.reason : ""}`));
    client.on("replaced", (r) => mark(`replaced ${r.reason}`));
    await client.run(runaway, null, { timeoutMs: 300 }).result.catch(() => undefined);
    await new Promise<void>((resolve) => {
      const check = (): void => (client.status === "ready" && client.generation >= 2 ? resolve() : void setTimeout(check, 50));
      check();
    });
    return { log, totalMs: Math.round(performance.now() - t0) };
  }, RUNAWAY);
  record(info, "open-items", "reopen-after-replaced-worker", result);
  expect(result.log.some((e) => e.event.startsWith("replaced timeout"))).toBe(true);
  expect(await count(page, "MATCH (b:Bulk) RETURN count(b) AS c")).toBe(1000);
});

test("(b) how long a second client waits for a store a busy worker held, and whether the bounded retry covers it", async ({ context, page }, info) => {
  await openReady(page, app({ name: "busy" }));
  await makeBulk(page);
  // a statement is running in the worker when the tab goes away
  await page.evaluate((runaway) => void window.client!.query(runaway).catch(() => undefined), RUNAWAY);
  await page.waitForTimeout(300);
  await page.close();
  const next = await context.newPage();
  await openHarness(next);
  const outcome = await next.evaluate(
    (a) =>
      new Promise<{ ms: number; waitingReported: boolean }>((resolve) => {
        const t0 = performance.now();
        let waitingReported = false;
        const client = window.app.make(a as never);
        client.on("storage", (s) => {
          if (s.kind === "waiting") waitingReported = true;
        });
        client.on("status", (s) => {
          if (s.status === "ready") resolve({ ms: Math.round(performance.now() - t0), waitingReported });
        });
      }),
    app({ name: "busy" }),
  );
  record(info, "open-items", "second-client-after-busy-holder", { ...outcome, boundedRetryMs: 5000, note: "waitingReported true means the bounded retry (5 s) was exceeded" });
  expect(outcome.ms).toBeLessThan(60_000);
});

test("(c) indexes persist across a reopen, whether created on first run or by a migration", async ({ page }, info) => {
  await openReady(page, app({ name: "idx" }));
  await rows(page, "MATCH (p:Person {name: 'Ada'}) RETURN p.id AS id");
  const first = (await rows(page, "SHOW INDEXES WHERE type <> 'LOOKUP'")).map((r) => ({ name: r.name, state: r.state, readCount: r.readCount }));
  await page.evaluate(() => window.client!.destroy());
  await page.waitForTimeout(600);
  await openHarness(page);
  await makeClient(page, app({ name: "idx" }));
  await waitStatus(page, "ready");
  const reopened = (await rows(page, "SHOW INDEXES WHERE type <> 'LOOKUP'")).map((r) => ({ name: r.name, state: r.state, readCount: r.readCount }));
  expect(reopened.filter((i) => i.name === "Person_name")).toHaveLength(1);
  expect(reopened.find((i) => i.name === "Person_name")!.state).toBe("ONLINE");
  // an index added by a migration
  await page.evaluate(() => window.client!.destroy());
  await page.waitForTimeout(600);
  await openHarness(page);
  await makeClient(page, app({ name: "idx", version: 2, migrations: { 2: ["CREATE INDEX IF NOT EXISTS FOR (p:Person) ON (p.n)"] } }));
  await waitStatus(page, "ready");
  await page.evaluate(() => window.client!.destroy());
  await page.waitForTimeout(600);
  await openHarness(page);
  await makeClient(page, app({ name: "idx", version: 2, migrations: { 2: ["CREATE INDEX IF NOT EXISTS FOR (p:Person) ON (p.n)"] } }));
  await waitStatus(page, "ready");
  const afterMigration = (await rows(page, "SHOW INDEXES WHERE type <> 'LOOKUP'")).map((r) => r.name);
  expect(afterMigration).toContain("Person_n");
  record(info, "open-items", "index-persistence", { firstRun: first, reopened, afterMigrationReopen: afterMigration });
});

test("(d) typed reads detect each kind of value in this browser's engine, including mixed types and large integers", async ({ page }, info) => {
  await openReady(page, app({ name: "typed", seed: { version: 1, nodes: [], links: [] } }));
  await rows(page, "CREATE (:T {id: 'a', big: 9007199254740993, f: 2.0, d: date('2024-01-02'), dur: duration('P1D'), p: point({x: 1, y: 2}), e: [], m: 1}), (:T {id: 'b', m: 'text'}), (:T {id: 'c', m: 3.5}), (:T {id: 7})");
  const read = await rows(page, "MATCH (n:T) UNWIND keys(n) AS k RETURN n.id AS id, k, valueType(n[k]) AS t, toString(n[k]) AS s ORDER BY id, k");
  const by = (id: unknown, k: string) => read.find((r) => r.id === id && r.k === k)!;
  expect(by("a", "big")).toMatchObject({ t: "INTEGER NOT NULL", s: "9007199254740993" });
  expect(by("a", "f")).toMatchObject({ t: "FLOAT NOT NULL", s: "2.0" });
  expect(by("a", "d").t).toBe("DATE NOT NULL");
  expect(by("a", "dur").t).toBe("DURATION NOT NULL");
  expect(by("a", "p").t).toBe("POINT NOT NULL");
  expect(by("a", "e").t).toBe("LIST<NOTHING> NOT NULL");
  expect([by("a", "m").t, by("b", "m").t, by("c", "m").t]).toEqual(["INTEGER NOT NULL", "STRING NOT NULL", "FLOAT NOT NULL"]);
  expect(by(7, "id").t).toBe("INTEGER NOT NULL");
  record(info, "open-items", "typed-reads", "per-value valueType()/toString() gave the expected type for every kind");
  expect(await storage(page)).toMatchObject({ kind: "durable" });
});
