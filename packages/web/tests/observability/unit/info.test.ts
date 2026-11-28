// covers-obs: FR-009, FR-010, SC-005
import { afterEach, describe, expect, it, vi } from "vitest";
import type { Client } from "../../../src/client/types.js";
import { Engine } from "../../../src/worker/engine.js";
import { client, crash, doc, ready_, settle } from "./harness.js";

let c: Client | null = null;
afterEach(() => {
  c?.destroy();
  c = null;
  vi.restoreAllMocks();
});

describe("the client description", () => {
  it("is null before the client is ready", async () => {
    c = await client();
    expect(c.status).not.toBe("ready");
    expect(c.info).toBeNull();
  });

  it("describes an unnamed in-memory graph", async () => {
    c = await ready_(await client());
    expect(c.info).toEqual({ name: null, kind: "memory", readOnly: false, engine: "1.4.0" });
  });

  it("describes an application graph by its store name", async () => {
    c = await ready_(await client({ graph: undefined, application: { name: "notes", version: 1, seed: doc } }));
    expect(c.info).toMatchObject({ name: "app-notes", kind: "application", readOnly: false });
    expect(c.info!.engine).toMatch(/^\d+\.\d+\.\d+/);
  });

  it("is available again, with the new instance's engine, after the instance is replaced", async () => {
    c = await ready_(await client());
    crash(); // the worker fails and the client replaces the instance
    expect(c.info).toBeNull();
    for (let i = 0; i < 200 && (c.generation < 2 || c.status !== "ready"); i++) await settle();
    expect(c.info).toMatchObject({ kind: "memory", engine: "1.4.0" });
  });

  it("says the engine version is unknown, as null, when the engine does not report one", async () => {
    vi.spyOn(Engine.prototype, "version").mockReturnValue(null);
    c = await ready_(await client());
    expect(c.info).toMatchObject({ kind: "memory", engine: null });
  });

  it("is the same object for the same instance", async () => {
    c = await ready_(await client());
    expect(c.info).toBe(c.info);
  });
});
