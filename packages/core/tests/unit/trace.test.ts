// covers: SC-005
import { execFileSync } from "node:child_process";
import { describe, expect, it } from "vitest";

describe("the traceability check", () => {
  it("finds every requirement and success criterion of the specification tagged in a test", () => {
    const out = execFileSync("pnpm", ["exec", "tsx", "tests/trace/check-trace.ts", "--static"], { cwd: new URL("../..", import.meta.url).pathname, encoding: "utf8" });
    expect(out).toMatch(/ids in the specification/);
  });
});
