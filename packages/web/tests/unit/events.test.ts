// covers: FR-036, SC-012
import { describe, expect, it } from "vitest";
import { Emitter } from "../../src/client/events.js";

describe("the event emitter", () => {
  it("delivers a payload to every listener of an event", () => {
    const e = new Emitter();
    const a: unknown[] = [];
    const b: unknown[] = [];
    e.on("status", (p) => a.push(p));
    e.on("status", (p) => b.push(p));
    e.emit("status", () => ({ status: "ready", generation: 1 }));
    expect(a).toEqual([{ status: "ready", generation: 1 }]);
    expect(b).toEqual(a);
  });

  it("does no work at all when nothing listens: the payload is never built", () => {
    const e = new Emitter();
    let built = 0;
    e.emit("replaced", () => {
      built++;
      return { reason: "trap" as const, generation: 2 };
    });
    expect(built).toBe(0);
    expect(e.has("replaced")).toBe(false);
  });

  it("builds the payload once however many listeners there are", () => {
    const e = new Emitter();
    let built = 0;
    e.on("timing", () => {});
    e.on("timing", () => {});
    e.emit("timing", () => {
      built++;
      return { phase: "total" as const, ms: 5, restored: false };
    });
    expect(built).toBe(1);
  });

  it("stops delivering after the listener is removed", () => {
    const e = new Emitter();
    const seen: unknown[] = [];
    const off = e.on("status", (p) => seen.push(p));
    off();
    e.emit("status", () => ({ status: "ready", generation: 1 }));
    expect(seen).toEqual([]);
    expect(e.has("status")).toBe(false);
  });

  it("keeps delivering to the others when a listener throws", () => {
    const e = new Emitter();
    const seen: unknown[] = [];
    e.on("status", () => {
      throw new Error("boom");
    });
    e.on("status", (p) => seen.push(p));
    e.emit("status", () => ({ status: "ready", generation: 1 }));
    expect(seen).toHaveLength(1);
  });

  it("has no way to send an event out of the page: it uses no network or messaging API", async () => {
    const { readFileSync } = await import("node:fs");
    const source = readFileSync(new URL("../../src/client/events.ts", import.meta.url), "utf8");
    expect(source).not.toMatch(/\b(fetch|XMLHttpRequest|sendBeacon|WebSocket|postMessage|BroadcastChannel)\b/);
  });
});
