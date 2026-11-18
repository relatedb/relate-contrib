// covers-ph: FR-007, FR-008, FR-009, FR-010, FR-011, FR-012
import { GraphError } from "@relate/web";
import { describe, expect, it } from "vitest";
import { ReplyCache, type Bridge, type CacheClient } from "../../src/index.js";
import { openEngine } from "../helpers/engine.js";
import { FakeClient } from "../helpers/fake-client.js";

interface Board {
  cells: Record<string, string>;
  loads: number;
}
const board = (): Board => ({ cells: {}, loads: 0 });
const loadCells = (bridge: Bridge) =>
  bridge.enqueue("MATCH (c:Cell) RETURN c.id AS id, c.v AS v").then((rows) => (s: Board) => {
    s.cells = Object.fromEntries(rows.map((r) => [r["id"] as string, r["v"] as string]));
    s.loads++;
  });

async function setup(status: "ready" | "loading" = "ready") {
  const engine = await openEngine();
  await engine.query("CREATE (:Cell {id: 'a', v: 'one'})");
  const client = new FakeClient(engine.query, status);
  const cache = new ReplyCache<Board>({ client: client as unknown as CacheClient, initial: board(), load: loadCells });
  return { engine, client, cache };
}

describe("the reply cache", () => {
  it("bumps the version by one for each commit", async () => {
    const { cache } = await setup();
    const v = cache.version;
    cache.commit((s) => (s.cells["x"] = "y"));
    expect(cache.version).toBe(v + 1);
    expect(cache.state.cells["x"]).toBe("y");
  });

  it("shows an optimistic change at once, holds the key while the action runs, and commits the reply", async () => {
    const { cache, engine } = await setup();
    await cache.start();
    let seenDuring: { pending: string | null; cell: string | undefined } | undefined;
    const result = await cache.act("b", {
      optimistic: (s) => {
        s.cells["b"] = "pending";
        return () => delete s.cells["b"];
      },
      run: async (commit, bridge) => {
        seenDuring = { pending: cache.pending, cell: cache.state.cells["b"] };
        await bridge.enqueue("CREATE (:Cell {id: 'b', v: 'two'})");
        commit((s) => (s.cells["b"] = "two"));
      },
    });
    expect(result).toEqual({ ok: true });
    expect(seenDuring).toEqual({ pending: "b", cell: "pending" });
    expect(cache.pending).toBeNull();
    expect(cache.state.cells["b"]).toBe("two");
    expect((await engine.query("MATCH (c:Cell {id:'b'}) RETURN c.v AS v")).rows).toEqual([{ v: "two" }]);
  });

  it("shows the key of an action at once when no action is ahead of it", async () => {
    const { cache } = await setup();
    const v = cache.version;
    const done = cache.act("now", { run: async () => undefined });
    expect(cache.pending).toBe("now");
    expect(cache.version).toBeGreaterThan(v);
    await done;
    expect(cache.pending).toBeNull();
  });

  it("queues a second action behind the first and applies its optimistic part only when its turn comes", async () => {
    const { cache } = await setup();
    let release!: () => void;
    const gate = new Promise<void>((r) => (release = r));
    const log: string[] = [];
    const first = cache.act("one", { run: async () => { log.push("one starts"); await gate; log.push("one ends"); } });
    const second = cache.act("two", {
      optimistic: (s) => {
        log.push("two optimistic");
        s.cells["two"] = "x";
        return () => undefined;
      },
      run: async () => void log.push("two runs"),
    });
    await Promise.resolve();
    expect(cache.pending).toBe("one");
    expect(cache.state.cells["two"]).toBeUndefined();
    release();
    await Promise.all([first, second]);
    expect(log).toEqual(["one starts", "one ends", "two optimistic", "two runs"]);
  });

  it("rolls back an optimistic change on a rejection, returns the error, throws nothing, and moves the version", async () => {
    const { cache } = await setup();
    await cache.start();
    const v = cache.version;
    const result = await cache.act("bad", {
      optimistic: (s) => {
        s.cells["bad"] = "x";
        return () => delete s.cells["bad"];
      },
      run: async (_c, bridge) => void (await bridge.enqueue("NOT CYPHER")),
    });
    expect(result.ok).toBe(false);
    expect(cache.state.cells["bad"]).toBeUndefined();
    expect(cache.pending).toBeNull();
    expect(cache.version).toBeGreaterThan(v);
  });

  it("reloads once after a new generation, committing the game's reads in one step, and not twice at the first ready", async () => {
    const { cache, client, engine } = await setup("loading");
    const started = cache.start();
    await client.becomeReady(); // generation 1: the first load
    await started;
    expect(cache.state.loads).toBe(1);
    await engine.query("CREATE (:Cell {id: 'z', v: 'late'})"); // the restored graph differs from what was cached
    await client.replaceInstance(); // generation 2
    expect(cache.state.loads).toBe(2);
    expect(cache.state.cells["z"]).toBe("late");
  });

  it("rolls back an action rejected with lost and does not repeat it", async () => {
    const { cache, client } = await setup();
    await cache.start();
    client.rejectNext = client.lost();
    let runs = 0;
    const result = await cache.act("x", {
      optimistic: (s) => {
        s.cells["x"] = "tmp";
        return () => delete s.cells["x"];
      },
      run: async (_c, bridge) => {
        runs++;
        await bridge.enqueue("CREATE (:Cell {id: 'x', v: 'v'})");
      },
    });
    expect(result.ok).toBe(false);
    expect((result as { error: Error }).error).toBeInstanceOf(GraphError);
    await client.replaceInstance();
    expect(runs).toBe(1);
    expect(cache.state.cells["x"]).toBeUndefined();
  });

  it("keeps the previous state and the client's status when a reload is rejected", async () => {
    const { cache, client } = await setup();
    await cache.start();
    expect(cache.state.cells["a"]).toBe("one");
    client.rejectNext = client.lost();
    await client.replaceInstance();
    expect(cache.state.cells["a"]).toBe("one");
    expect(cache.status).toBe("ready");
    client.setStatus("failed");
    expect(cache.status).toBe("failed");
  });

  it("starts from the client's status and follows its status event, bumping the version", async () => {
    const { cache, client } = await setup();
    expect(cache.status).toBe("ready");
    const v = cache.version;
    client.setStatus("recovering");
    expect(cache.status).toBe("recovering");
    expect(cache.version).toBe(v + 1);
    const loading = new ReplyCache<Board>({ client: new FakeClient(async () => ({ error: null, rows: [] }), "loading") as unknown as CacheClient, initial: board(), load: async () => () => undefined });
    expect(loading.status).toBe("loading");
  });

  it("rejects an action at once while the client has failed, and queues nothing", async () => {
    const { cache, client } = await setup();
    client.setStatus("failed");
    const before = client.calls.length;
    const result = await cache.act("x", { run: async (_c, bridge) => void (await bridge.enqueue("RETURN 1")) });
    expect(result.ok).toBe(false);
    expect(((result as { error: GraphError }).error).reason).toBe("failed");
    expect(client.calls.length).toBe(before);
  });

  it("stops following the client after destroy, and keeps two caches over one client independent", async () => {
    const { cache, client } = await setup();
    await cache.start();
    const other = new ReplyCache<Board>({ client: client as unknown as CacheClient, initial: board(), load: loadCells });
    await other.start();
    cache.destroy();
    const loads = cache.state.loads;
    await client.replaceInstance();
    expect(cache.state.loads).toBe(loads);
    expect(other.state.loads).toBe(2);
  });

  it("leaves the version unchanged and lets the error reach the caller when a patch throws", async () => {
    const { cache } = await setup();
    const v = cache.version;
    expect(() => cache.commit(() => { throw new Error("patch"); })).toThrow("patch");
    expect(cache.version).toBe(v);
  });

  it("exports no undo, snapshot, knowledge state or statement: the shape of the game stays the game's", async () => {
    const exported = Object.keys(await import("../../src/index.js")).sort();
    expect(exported.filter((n) => /undo|snapshot|knowledge|statement(s)?$|seed|hex|fog/i.test(n) && n !== "StatementError")).toEqual([]);
    const { cache } = await setup();
    expect(Object.getOwnPropertyNames(Object.getPrototypeOf(cache)).filter((n) => /undo|snapshot|knowledge/i.test(n))).toEqual([]);
  });
});
