// covers: FR-029, SC-008, SC-011
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
