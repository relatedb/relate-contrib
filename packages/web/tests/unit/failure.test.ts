// covers: FR-009, FR-033, SC-010
import { describe, expect, it } from "vitest";
import { FailureCounter } from "../../src/client/failure.js";
import { diagnosticMessage } from "../../src/client/diagnostic.js";

describe("the failure counter", () => {
  it("starts at zero", () => {
    expect(new FailureCounter().failures).toBe(0);
  });

  it("counts attempts that fail to reach ready, starting with the initial load, and gives up at three", () => {
    const c = new FailureCounter();
    expect(c.attemptFailed("worker-error")).toBe("retry"); // the initial attempt
    expect(c.failures).toBe(1);
    expect(c.attemptFailed("trap")).toBe("retry");
    expect(c.failures).toBe(2);
    expect(c.attemptFailed("worker-error")).toBe("give-up");
    expect(c.failures).toBe(3);
  });

  it("resets when an instance reaches ready", () => {
    const c = new FailureCounter();
    c.attemptFailed("worker-error");
    c.attemptFailed("worker-error");
    c.ready();
    expect(c.failures).toBe(0);
    expect(c.attemptFailed("worker-error")).toBe("retry");
    expect(c.failures).toBe(1);
  });

  it("does not count a fault from ready: three replacements can still fail after one", () => {
    const c = new FailureCounter();
    c.ready(); // the instance was ready; a fault then ends it. The fault itself is not reported here.
    expect(c.attemptFailed("worker-error")).toBe("retry");
    expect(c.attemptFailed("worker-error")).toBe("retry");
    expect(c.attemptFailed("worker-error")).toBe("give-up");
    expect(c.failures).toBe(3);
  });

  it("resets on a fresh attempt", () => {
    const c = new FailureCounter();
    for (let i = 0; i < 3; i++) c.attemptFailed("worker-error");
    c.reset();
    expect(c.failures).toBe(0);
    expect(c.attemptFailed("worker-error")).toBe("retry");
  });

  it("gives up at once, with no attempt counted, when the browser cannot run workers", () => {
    const c = new FailureCounter();
    expect(c.attemptFailed("unsupported")).toBe("give-up");
    expect(c.failures).toBe(0);
  });

  it("takes the limit as a parameter", () => {
    const c = new FailureCounter(1);
    expect(c.attemptFailed("worker-error")).toBe("give-up");
  });
});

describe("the failure wording", () => {
  it("is empty when there is no failure", () => {
    expect(diagnosticMessage(null)).toBe("");
  });

  it("states the reason, the attempts and the engine's text, and suggests reporting an issue at the given link", () => {
    const text = diagnosticMessage({ reason: "trap", failures: 3, engineError: "memory access out of bounds" }, "https://example.org/issues");
    expect(text).toContain("3 attempts");
    expect(text).toContain("trap");
    expect(text).toContain("memory access out of bounds");
    expect(text).toContain("report this as an issue at https://example.org/issues");
  });

  it("still suggests reporting an issue when no link is configured", () => {
    expect(diagnosticMessage({ reason: "worker-error", failures: 1, engineError: null })).toMatch(/report this as an issue/);
  });

  it("explains an unsupported browser without counting attempts", () => {
    const text = diagnosticMessage({ reason: "unsupported", failures: 0, engineError: "WebAssembly is not available" });
    expect(text).toMatch(/cannot run/);
    expect(text).not.toMatch(/attempts/);
  });
});
