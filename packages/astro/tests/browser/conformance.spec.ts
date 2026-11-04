// covers: FR-025, FR-027, FR-028, SC-004, SC-005
import { expect, test } from "./fixtures.js";
import { formatReport, runConformance, type Profile } from "related-web-core/conformance";

const sites: Record<Profile, string> = { "multi-page": "http://127.0.0.1:5180", "client-routing": "http://127.0.0.1:5181" };

// Variant a is the registered graph, whose data file is named by its revision; variant b is a static file.
const dataRequests = {
  a: (url: string) => new URL(url).pathname.startsWith("/_related/example/graph."),
  b: (url: string) => new URL(url).pathname === "/graph-b.json",
};

for (const profile of ["client-routing", "multi-page"] as Profile[]) {
  test(`@conformance the conformance site passes the core's scenarios under ${profile}`, async ({ browserName }) => {
    test.setTimeout(600_000);
    const report = await runConformance({ baseUrl: sites[profile], profile, browser: browserName, dataRequests });
    console.log(formatReport(report));
    expect(report.failures.map((f) => `${f.id}: ${f.error}`)).toEqual([]);
    expect(report.results.filter((r) => r.status === "passed").length).toBeGreaterThanOrEqual(profile === "multi-page" ? 11 : 8);
  });
}
