// covers: FR-002
import { describe, expect, it } from "vitest";
import { StatusMachine } from "../../src/client/status.js";

describe("the status machine", () => {
  it("starts loading with generation 0", () => {
    const m = new StatusMachine();
    expect(m.status).toBe("loading");
    expect(m.generation).toBe(0);
  });

  it("goes loading to ready with generation 1", () => {
    const m = new StatusMachine();
    m.markReady();
    expect(m.status).toBe("ready");
    expect(m.generation).toBe(1);
  });

  it("increases the generation only when a replacement is ready, not when a fault begins", () => {
    const m = new StatusMachine();
    m.markReady();
    m.markRecovering();
    expect(m.status).toBe("recovering");
    expect(m.generation).toBe(1);
    m.markReady();
    expect(m.status).toBe("ready");
    expect(m.generation).toBe(2);
  });

  it("goes to failed and back to loading on a fresh attempt, keeping the generation", () => {
    const m = new StatusMachine();
    m.markReady();
    m.markRecovering();
    m.markFailed();
    expect(m.status).toBe("failed");
    expect(m.generation).toBe(1);
    m.markLoading();
    expect(m.status).toBe("loading");
    m.markReady();
    expect(m.generation).toBe(2);
  });

  it("reports each change to a listener, and nothing when the status stays the same", () => {
    const seen: Array<[string, number]> = [];
    const m = new StatusMachine((status, generation) => seen.push([status, generation]));
    m.markRecovering(); // loading -> recovering
    m.markRecovering(); // no change
    m.markReady();
    expect(seen).toEqual([
      ["recovering", 0],
      ["ready", 1],
    ]);
  });
});
