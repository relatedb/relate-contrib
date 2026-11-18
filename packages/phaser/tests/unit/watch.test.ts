// covers-ph: FR-014, SC-005
import { EventEmitter } from "node:events";
import { describe, expect, it } from "vitest";
import { versionWatch, watchCache } from "../../src/index.js";

/** A scene double: an emitter with the `on`/`off` a Phaser scene's `events` has. */
const scene = () => {
  const events = new EventEmitter();
  return { events: { on: (e: string, f: () => void) => events.on(e, f), off: (e: string, f: () => void) => events.off(e, f) }, emit: (e: string) => events.emit(e), listeners: (e: string) => events.listenerCount(e) };
};

describe("the version watcher", () => {
  it("reports false with no change, true once for one or several changes, then false", () => {
    const cache = { version: 0 };
    const changed = versionWatch(cache);
    expect(changed()).toBe(false);
    cache.version++;
    expect(changed()).toBe(true);
    expect(changed()).toBe(false);
    cache.version += 3;
    expect(changed()).toBe(true);
    expect(changed()).toBe(false);
  });
});

describe("the scene helper", () => {
  it("redraws once per change and not otherwise: 600 updates with commits on 5 give 5 redraws", () => {
    const s = scene();
    const cache = { version: 0 };
    let redraws = 0;
    watchCache(s, cache, () => redraws++);
    for (let i = 0; i < 600; i++) {
      if (i % 120 === 0) cache.version++;
      s.emit("update");
    }
    expect(redraws).toBe(5);
  });

  it("redraws once for several commits between two updates, and never when the version never changes", () => {
    const s = scene();
    const cache = { version: 0 };
    let redraws = 0;
    watchCache(s, cache, () => redraws++);
    s.emit("update");
    expect(redraws).toBe(0);
    cache.version += 4;
    s.emit("update");
    s.emit("update");
    expect(redraws).toBe(1);
  });

  it("stops and removes its listeners on shutdown, or when released", () => {
    const s = scene();
    const cache = { version: 0 };
    let redraws = 0;
    watchCache(s, cache, () => redraws++);
    s.emit("shutdown");
    cache.version++;
    s.emit("update");
    expect(redraws).toBe(0);
    expect(s.listeners("update")).toBe(0);
    expect(s.listeners("shutdown")).toBe(0);
    const release = watchCache(s, cache, () => redraws++);
    release();
    cache.version++;
    s.emit("update");
    expect(redraws).toBe(0);
  });
});
