// covers-obs: FR-011, SC-006
import { afterEach, describe, expect, it } from "vitest";
import type { Client } from "../../../src/client/types.js";
import { client, newEngine, ready_, received } from "./harness.js";

let c: Client | null = null;
afterEach(() => {
  c?.destroy();
  c = null;
});

describe("a client that uses none of it", () => {
  it("tells its worker nothing new and passes results through as the engine wrote them", async () => {
    c = await ready_(await client());
    expect(received.filter((m) => m.type === "observe")).toEqual([]);
    const init = received.find((m) => m.type === "init") as { observe?: boolean };
    expect(init.observe).toBe(false);
    const reply = await c.query("RETURN 1 AS a, 'x' AS b");
    const direct = JSON.parse(newEngine().execute("RETURN 1 AS a, 'x' AS b", null)) as Record<string, unknown>;
    // the same keys and values as the engine wrote, apart from the timings it measured for this very run
    const untimed = (o: Record<string, unknown>): Record<string, unknown> => Object.fromEntries(Object.entries(o).filter(([k]) => !k.endsWith("_ms")));
    const mine = untimed(reply as Record<string, unknown>);
    const theirs = untimed(direct);
    expect(mine).toEqual(theirs);
  });

  it("still delivers the events it had, with the payloads it had, to a listener that gives no options", async () => {
    const seen: Array<[string, Record<string, unknown>]> = [];
    c = await client({}, (made) => {
      made.on("status", (e) => seen.push(["status", e]));
      made.on("timing", (e) => seen.push(["timing", e]));
    });
    await ready_(c);
    expect(seen.find(([n]) => n === "status" && (seen[0]![1] as { status: string }).status)).toBeDefined();
    expect(seen.some(([n, e]) => n === "status" && e.status === "ready" && e.generation === 1)).toBe(true);
    expect(seen.filter(([n]) => n === "timing").map(([, e]) => e.phase)).toContain("total");
  });

  it("keeps the generation as it was: 0 before the first instance is ready, then 1", async () => {
    c = await client();
    expect(c.generation).toBe(0);
    await ready_(c);
    expect(c.generation).toBe(1);
  });
});
