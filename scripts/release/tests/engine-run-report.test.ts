// covers-rel: FR-020, SC-006
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { engineRunReport, type RunResult } from "../engine-run-report.js";

const load = (name: string) => JSON.parse(readFileSync(join(import.meta.dirname, "fixtures/engine-releases", name), "utf8")) as RunResult;

describe("the issue for a failed engine-release run", () => {
  it("titles it with the engine release, and names the run, the engine release and each failing package's failing tests", () => {
    const r = engineRunReport(load("fail.json"), "https://github.com/o/r/actions/runs/1")!;
    expect(r.title).toBe("Engine release 0.17.0 breaks packages");
    expect(r.body).toContain("https://github.com/o/r/actions/runs/1");
    expect(r.body).toContain("0.17.0");
    expect(r.body).toContain("**@relate/contrib-web**");
    expect(r.body).toContain("- a trapped instance is unusable afterwards");
    expect(r.body).toContain("**@relate/contrib-react-admin**");
    expect(r.body).toContain("- a uniqueness constraint refuses a duplicate id");
    expect(r.body).not.toContain("**@relate/contrib-astro**"); // it passed
  });

  it("produces no report for a run with no failure", () => {
    expect(engineRunReport(load("pass.json"), "https://example/run")).toBeNull();
  });

  it("says when a failing package recorded no test title", () => {
    const r = engineRunReport({ version: "0.17.0", results: [{ package: "@relate/contrib-web", passed: false, failures: [] }] }, "u")!;
    expect(r.body).toContain("no test title was recorded");
  });
});
