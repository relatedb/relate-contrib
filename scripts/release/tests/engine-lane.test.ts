// covers-rel: FR-018, FR-019, FR-020, FR-021, FR-027, SC-006
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import YAML from "yaml";
import { failedTitles, runEngineChecks } from "../engine-run.js";
import { engineRunReport, type RunResult } from "../engine-run-report.js";
import { untestedReleases } from "../engine-releases.js";
import { raiseEngineRange } from "../raise-engine-range.js";
import { useEngine } from "../use-engine.js";
import { repoRoot } from "../lib/workspace.js";
import { makeFixture, type Fixture } from "./helpers/fixture-workspace.js";

let fx: Fixture | undefined;
afterEach(() => fx?.remove());
const REGISTRY = { versions: ["0.16.1", "0.17.0", "0.17.1-rc.1"], tested: ["0.16.1"] };
const wf = YAML.parse(readFileSync(join(repoRoot(), ".github/workflows/engine-release.yml"), "utf8")) as Record<string, any>;

/** A fake runner: commands for the named packages fail. */
const runner = (failing: string[]) => (command: string[]) => ({ status: failing.some((p) => command.includes(p)) ? 1 : 0 });

describe("pointing a checkout at an engine release", () => {
  it("removes the override that links the vendored build, sets the catalog entry, and keeps everything else", () => {
    fx = makeFixture();
    writeFileSync(join(fx.root, "pnpm-workspace.yaml"), 'packages:\n  - "packages/*"\ncatalog:\n  \"@relate/relate-wasm\": 0.16.1\nallowBuilds:\n  esbuild: true\noverrides:\n  "@relate/relate-wasm": "link:vendor/relate-wasm/pkg"\n');
    useEngine(fx.root, "0.17.0");
    const doc = YAML.parse(readFileSync(join(fx.root, "pnpm-workspace.yaml"), "utf8"));
    expect(doc.overrides).toBeUndefined();
    expect(doc.catalog["@relate/relate-wasm"]).toBe("0.17.0");
    expect(doc.allowBuilds).toEqual({ esbuild: true });
    expect(() => useEngine(fx!.root, "0.17.1-rc.1")).toThrow(/not a release/);
  });
});

describe("the engine-release lane's decisions", () => {
  it("a release whose tests pass raises every package's range by a recorded change; one whose tests fail raises none and reports", () => {
    fx = makeFixture();
    const names = ["@relate/contrib-web", "@relate/contrib-astro", "@relate/contrib-nextjs", "@relate/contrib-observable", "@relate/contrib-sveltekit", "@relate/contrib-react-admin", "@relate/contrib-phaser"];

    // a pass: every package passes
    const pass = runEngineChecks(fx.root, "0.17.0", runner([]));
    expect(pass.results.every((r) => r.passed)).toBe(true);
    expect(engineRunReport(pass, "u")).toBeNull();
    const raised = raiseEngineRange(fx.root, "0.17.0", pass.results.filter((r) => r.package.startsWith("@relate/")).map((r) => r.package), REGISTRY.versions);
    expect(raised.raised.sort()).toEqual(names.filter((n) => !["@relate/contrib-react-admin", "@relate/contrib-phaser"].includes(n)).sort());
    expect(raised.skipped.sort()).toEqual(["@relate/contrib-phaser", "@relate/contrib-react-admin"]);

    fx.remove();
    fx = makeFixture();
    // a fail: the core and the data provider fail, the rest pass
    const fail = runEngineChecks(fx.root, "0.17.0", runner(["@relate/contrib-web", "@relate/contrib-react-admin"]));
    expect(fail.results.filter((r) => !r.passed).map((r) => r.package).sort()).toEqual(["@relate/contrib-react-admin", "@relate/contrib-web"]);
    const report = engineRunReport(fail, "u")!;
    expect(report.title).toBe("Engine release 0.17.0 breaks packages");
    const ok = fail.results.filter((r) => r.passed && r.package.startsWith("@relate/")).map((r) => r.package);
    raiseEngineRange(fx.root, "0.17.0", ok, REGISTRY.versions);
    const webRange = JSON.parse(readFileSync(join(fx.root, "packages/web/package.json"), "utf8")).peerDependencies["@relate/relate-wasm"];
    expect(webRange).toBe(">=0.16.1 <=0.16.1"); // the failing package's range did not move
  });

  it("a release already tested, a prerelease, and a package already at the release change nothing", () => {
    fx = makeFixture();
    expect(untestedReleases(REGISTRY.versions, [], REGISTRY.tested)).toEqual(["0.17.0"]); // 0.16.1 tested, the rc is never tested
    raiseEngineRange(fx.root, "0.17.0", ["@relate/contrib-astro"], REGISTRY.versions);
    const again = raiseEngineRange(fx.root, "0.17.0", ["@relate/contrib-astro"], REGISTRY.versions);
    expect(again).toMatchObject({ raised: [], leftAlone: ["@relate/contrib-astro"] });
  });

  it("two untested releases are tested once each, in order", () => {
    expect(untestedReleases(["0.17.1", "0.17.0", "0.17.0"], [], [])).toEqual(["0.17.0", "0.17.1"]);
  });

  it("reads the failed test titles from a package's Vitest report", () => {
    fx = makeFixture();
    mkdirSync(join(fx.root, "packages/web/reports"), { recursive: true });
    const report = { testResults: [{ assertionResults: [{ status: "passed", fullName: "ok" }, { status: "failed", fullName: "the engine reports an error in the result" }] }] };
    writeFileSync(join(fx.root, "packages/web/reports/vitest.json"), JSON.stringify(report));
    expect(failedTitles(report)).toEqual(["the engine reports an error in the result"]);
    const run = runEngineChecks(fx.root, "0.17.0", runner(["@relate/contrib-web"]));
    expect(run.results.find((r) => r.package === "@relate/contrib-web")!.failures).toEqual(["the engine reports an error in the result"]);
  });

  it("runs the drift check once for the workspace and attributes its failure", () => {
    fx = makeFixture();
    const run = runEngineChecks(fx.root, "0.17.0", (cmd) => ({ status: cmd.includes("test:drift") ? 1 : 0 }));
    expect(run.results.at(-1)).toMatchObject({ package: "(drift check)", passed: false });
  });
});

describe("the engine-release workflow", () => {
  it("starts from a repository dispatch of type engine-release, an hourly schedule and a manual start", () => {
    expect(Object.keys(wf["on"]).sort()).toEqual(["repository_dispatch", "schedule", "workflow_dispatch"]);
    expect(wf["on"].repository_dispatch.types).toEqual(["engine-release"]);
    expect(wf["on"].schedule[0].cron).toMatch(/^\d+ \* \* \* \*$/);
  });

  it("tests each release once, in order, and never cancels a run that is testing one", () => {
    expect(wf["jobs"].test.strategy["max-parallel"]).toBe(1);
    expect(wf["concurrency"]["cancel-in-progress"]).toBe(false);
    expect(wf["jobs"].test.if).toContain("versions != '[]'");
  });

  it("holds the proposal at an approval environment and runs the report only on a failure's text", () => {
    expect(wf["jobs"].propose.environment).toBe("engine-release-approval");
    expect(wf["jobs"].propose.needs).toContain("test");
    expect(wf["jobs"].test.environment).toBeUndefined();
    expect(wf["jobs"].report.environment).toBeUndefined();
    const text = wf["jobs"].report.steps.find((s: any) => s.uses === "./.github/actions/report-failure");
    expect(text.if).toContain("steps.text.outputs.title != ''");
    expect(text.with.label).toBe("engine-release");
  });

  it("does not start a release and publishes nothing: no id-token permission and no publish step anywhere", () => {
    const text = readFileSync(join(repoRoot(), ".github/workflows/engine-release.yml"), "utf8");
    expect(text).not.toMatch(/id-token|npm publish|pnpm publish/);
  });
});
