// covers-rel: FR-022
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import YAML from "yaml";
import { repoRoot } from "../lib/workspace.js";

const root = repoRoot();
const load = (file: string) => YAML.parse(readFileSync(join(root, ".github/workflows", file), "utf8")) as Record<string, any>;
const pkg = JSON.parse(readFileSync(join(root, "package.json"), "utf8")) as { scripts: Record<string, string> };

describe("the repository's own gate includes the release checks", () => {
  const wf = load("release-checks.yml");
  const text = readFileSync(join(root, ".github/workflows/release-checks.yml"), "utf8");

  it("starts on pull requests and on pushes to the main branch", () => {
    expect(Object.keys(wf["on"]).sort()).toEqual(["pull_request", "push"]);
    expect(wf["on"].push.branches).toEqual(["main"]);
  });

  it("runs the fitness, engine range and recorded change checks and the scripts' unit tests", () => {
    for (const cmd of ["release:check-publishable", "release:check-engine-range", "release:check-changes", "test:release"]) expect(text).toContain(`pnpm ${cmd}`);
  });

  it("needs no engine, no browsers and no secrets, and has read-only contents", () => {
    expect(text).not.toMatch(/secrets\./);
    expect(text).not.toMatch(/uses: \.\/\.github\/actions\/setup/);
    expect(text).not.toMatch(/playwright|build:wasm|submodules: true/);
    expect(wf["permissions"]).toEqual({ contents: "read" });
  });

  it("is part of the full run: test:all reaches test:release through test:units and test:release-trace through test:traces-all", () => {
    expect(pkg.scripts["test:units"]).toContain("test:release");
    expect(pkg.scripts["test:traces-all"]).toContain("test:release-trace");
    expect(pkg.scripts["test:drift"]).toContain("test:units");
    expect(pkg.scripts["test:all"]).toContain("test:traces-all");
    expect(load("full.yml")["on"].push.branches).toEqual(["main"]);
  });

  it("is not blocked by an engine-release run: no workflow that runs on pull requests depends on engine-release, and it is not a required step of release-checks or full", () => {
    for (const file of readdirSync(join(root, ".github/workflows")).filter((f) => f.endsWith(".yml"))) {
      const body = readFileSync(join(root, ".github/workflows", file), "utf8");
      if (file !== "engine-release.yml") expect(body, file).not.toMatch(/workflow_run|needs: *engine-release/);
    }
    expect(load("engine-release.yml")["on"].pull_request).toBeUndefined();
    expect(load("engine-release.yml")["on"].push).toBeUndefined();
  });

  it("keeps the drift workflow's behaviour and moves its issue step onto the shared reporter", () => {
    const drift = readFileSync(join(root, ".github/workflows/drift.yml"), "utf8");
    expect(drift).toContain("./.github/actions/report-failure");
    expect(drift).toContain("Drift check failed on main");
    expect(drift).toContain("cron:");
  });
});
