// covers-obs: FR-012, SC-007
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const pkg = join(import.meta.dirname, "../../..");

describe("the package documentation", () => {
  const readme = readFileSync(join(pkg, "README.md"), "utf8");
  const section = readme.slice(readme.indexOf("## Observing a client"), readme.indexOf("## Supported browsers"));

  it("describes the three additions, the definition of a write and its limit, and the opt-in for parameters", () => {
    for (const word of [
      'client.on("statement"', "origin", "internal", "subscription", "write", "stats", "never guessed", "only as complete as the engine's counters",
      "params: true", "4 KiB", "paramsTruncated", "client.revision", "generation", "does not re-run",
      "client.info", "kind", "readOnly", "engine",
    ]) expect(section, word).toContain(word);
  });
});

describe("the trace check", () => {
  it("passes statically when every requirement of the specification is tagged", () => {
    const run = spawnSync("npx", ["tsx", "tests/observability/trace/check-trace-observability.ts", "--static"], { cwd: pkg, encoding: "utf8" });
    expect(run.status, run.stderr).toBe(0);
  });
});
