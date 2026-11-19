import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { flakyInDir, flakyTests } from "../flaky-report.js";
import { mergeReports } from "../merge-reports.js";

describe("joining the per-browser reports", () => {
  it("merges each name's browsers into one report, adding the suites and statistics", () => {
    const dir = mkdtempSync(join(tmpdir(), "reports-"));
    writeFileSync(join(dir, "playwright.chromium.json"), JSON.stringify({ suites: [{ title: "a" }], stats: { expected: 2, unexpected: 0 } }));
    writeFileSync(join(dir, "playwright.webkit.json"), JSON.stringify({ suites: [{ title: "b" }], stats: { expected: 1, unexpected: 1 } }));
    writeFileSync(join(dir, "application-playwright.firefox.json"), JSON.stringify({ suites: [{ title: "c" }] }));
    expect(mergeReports(dir).sort()).toEqual(["application-playwright.json", "playwright.json"]);
    const merged = JSON.parse(readFileSync(join(dir, "playwright.json"), "utf8"));
    expect(merged.suites.map((s: { title: string }) => s.title)).toEqual(["a", "b"]);
    expect(merged.stats).toEqual({ expected: 3, unexpected: 1 });
  });
  it("writes nothing for a folder with no per-browser reports, or none", () => {
    expect(mergeReports(mkdtempSync(join(tmpdir(), "reports-")))).toEqual([]);
    expect(mergeReports(join(tmpdir(), "no-such-folder-xyz"))).toEqual([]);
  });
});

describe("the list of tests that needed a retry", () => {
  const report = { suites: [{ suites: [{ specs: [
    { title: "steady", file: "a.spec.ts", tests: [{ projectName: "webkit", status: "expected" }] },
    { title: "wobbly", file: "b.spec.ts", tests: [{ projectName: "webkit", status: "flaky" }, { projectName: "chromium", status: "expected" }] },
  ] }] }] };
  it("names a test whose status is flaky, with its browser and file", () => {
    expect(flakyTests(report)).toEqual(["[webkit] b.spec.ts › wobbly"]);
  });
  it("reads the merged reports of a folder and not the per-browser ones", () => {
    const dir = mkdtempSync(join(tmpdir(), "reports-"));
    writeFileSync(join(dir, "playwright.json"), JSON.stringify(report));
    writeFileSync(join(dir, "playwright.webkit.json"), JSON.stringify(report));
    expect(flakyInDir(dir)).toHaveLength(1);
  });
});
