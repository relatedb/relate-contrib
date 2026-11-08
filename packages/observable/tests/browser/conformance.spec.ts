// covers: FR-022, FR-023, SC-004
import { formatReport, runConformance, scenarios } from "@relate/web/conformance";
import { expect, origin, test } from "./fixtures.js";

// Variant a is the loader-published pair, whose data file is named by a content hash; variant b is a plain file, which Framework
// also publishes under a hashed name.
const dataRequests = {
  a: (url: string) => /^\/_file\/data\/example\.graph\.[0-9a-f]+\.json$/.test(new URL(url).pathname),
  b: (url: string) => /^\/_file\/variants\/graph-b\.[0-9a-f]+\.json$/.test(new URL(url).pathname),
};

// C-09 asks that a `navigation` setting decide the profile. This framework has no client-side navigation and the adapter no such
// option (FR-017), so the scenario belongs to the adapters that have both (FR-023); every other scenario runs.
const only = scenarios.filter((s) => s.id !== "C-09" && s.profiles.includes("multi-page")).map((s) => s.id);

test("@conformance the conformance site passes the core's scenarios under the per-page profile", async ({ browserName }) => {
  test.setTimeout(600_000);
  const report = await runConformance({ baseUrl: origin, profile: "multi-page", browser: browserName, dataRequests, only });
  console.log(formatReport(report));
  expect(report.failures.map((f) => `${f.id}: ${f.error}`)).toEqual([]);
  expect(report.results.filter((r) => r.status === "passed").length).toBe(only.length);
  expect(only).toHaveLength(10);
});
