// covers: FR-029, SC-008, SC-011 (FR-028 of the Astro adapter, ADR-004: the dataRequests parameter)
import { expect, test } from "./fixtures.js";
import { formatReport, runConformance, type Profile } from "../../conformance/run.js";

const baseUrl = "http://localhost:5175";

for (const profile of ["client-routing", "multi-page"] as Profile[]) {
  test(`@conformance the example site passes the conformance check under ${profile}`, async ({ browserName }) => {
    test.setTimeout(600_000);
    const report = await runConformance({ baseUrl, profile, browser: browserName });
    console.log(formatReport(report));
    expect(report.failures.map((f) => `${f.id}: ${f.error}`)).toEqual([]);
    expect(report.results.filter((r) => r.status === "passed").length).toBeGreaterThanOrEqual(profile === "multi-page" ? 11 : 8);
  });
}

test("@conformance a variant whose subscriptions do not re-run fails C-04 and the report names the behavior", async ({ browserName }) => {
  test.setTimeout(300_000);
  const report = await runConformance({ baseUrl, profile: "multi-page", browser: browserName, query: "__break=no-rerun", only: ["C-04"] });
  expect(report.passed).toBe(false);
  expect(report.failures.map((f) => f.id)).toEqual(["C-04"]);
  expect(report.failures[0]?.behavior).toMatch(/subscriptions re-run after a replacement/);
  expect(formatReport(report)).toMatch(/broken behavior: subscriptions re-run after a replacement/);
});

test("@conformance the runner accepts matchers for data requests, as an adapter with other file names needs (ADR-004)", async ({ browserName }) => {
  test.setTimeout(300_000);
  const report = await runConformance({
    baseUrl,
    profile: "multi-page",
    browser: browserName,
    only: ["C-02", "C-07", "C-11"],
    dataRequests: { a: (url) => /\/graph\.json$/.test(new URL(url).pathname), b: (url) => /\/graph-b\.json$/.test(new URL(url).pathname) },
  });
  expect(report.failures.map((f) => `${f.id}: ${f.error}`)).toEqual([]);
  expect(report.results.filter((r) => r.status === "passed").length).toBe(3);
});
