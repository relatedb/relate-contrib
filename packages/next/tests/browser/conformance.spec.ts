// covers: FR-025, FR-029, FR-030, SC-005
import { formatReport, runConformance, type Profile } from "related-web-core/conformance";
import { BUILDS } from "../../playwright.config.js";
import { expect, test } from "./fixtures.js";

// Variant a is the registered graph, whose data file is named by its revision; variant b is a static file.
const dataRequests = {
  a: (url: string) => new URL(url).pathname.startsWith("/related-web/example/graph."),
  b: (url: string) => new URL(url).pathname === "/graph-b.json",
};

const only = process.env.GW_ONLY?.split(",");
for (const build of BUILDS.filter((b) => (!only || only.includes(b.name)) && !b.cache)) {
  test(`@conformance the conformance site passes the core's scenarios: ${build.name}`, async ({ browserName }) => {
    test.setTimeout(600_000);
    const profile = build.navigation as Profile;
    const report = await runConformance({ baseUrl: `http://127.0.0.1:${build.port}`, profile, browser: browserName, dataRequests });
    console.log(formatReport(report));
    expect(report.failures.map((f) => `${f.id}: ${f.error}`)).toEqual([]);
    expect(report.results.filter((r) => r.status === "passed").length).toBeGreaterThanOrEqual(profile === "multi-page" ? 11 : 8);
  });
}
