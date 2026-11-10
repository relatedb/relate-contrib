// covers-app: FR-001, FR-014, FR-027
import { describe, expect, it } from "vitest";
import { diagnosticMessage } from "../../../src/client/diagnostic.js";
import { FailureCounter } from "../../../src/client/failure.js";
import { APP_STORE_PREFIX, STORE_PREFIX } from "../../../src/config.js";

const FINAL = ["store-unmarked", "store-newer", "import-interrupted", "store-lost", "store-unreadable", "unavailable", "migration-failed"];

describe("failures that a repeat cannot change", () => {
  it.each(FINAL)("%s gives up at once and counts no attempt", (reason) => {
    const c = new FailureCounter();
    expect(c.attemptFailed(reason)).toBe("give-up");
    expect(c.failures).toBe(0);
  });

  it("keeps the three-attempt rule for the others", () => {
    const c = new FailureCounter();
    expect(c.attemptFailed("trap")).toBe("retry");
    expect(c.attemptFailed("worker-error")).toBe("retry");
    expect(c.attemptFailed("trap")).toBe("give-up");
  });
});

describe("the wording of an application failure", () => {
  it.each(["store-unmarked", "store-newer", "import-interrupted", "store-lost", "store-unreadable"])("%s says the data is unchanged and names resetApplication", (reason) => {
    const text = diagnosticMessage({ reason, failures: 0, engineError: "detail" });
    expect(text).toContain("not changed");
    expect(text).toContain("resetApplication()");
    expect(text).toContain("detail");
  });

  it("migration-failed carries the worker's message", () => {
    const text = diagnosticMessage({ reason: "migration-failed", failures: 0, engineError: "version 3: SET x" });
    expect(text).toContain("version 3: SET x");
  });
});

describe("constants", () => {
  it("keeps application stores apart from the content cache", () => {
    expect(APP_STORE_PREFIX).toBe("app-");
    expect(STORE_PREFIX).toBe("rel-");
  });
});
