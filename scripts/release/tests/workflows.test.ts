// covers-rel: FR-014, FR-015, FR-016, FR-017, FR-027, FR-028
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import YAML from "yaml";
import { repoRoot } from "../lib/workspace.js";

const load = (name: string) => YAML.parse(readFileSync(join(repoRoot(), ".github/workflows", name), "utf8")) as Record<string, any>;

describe("the release workflow", () => {
  const wf = load("release.yml");

  it("starts only from a version tag of the form <package name>@<version>, or from a manual start", () => {
    const on = wf["on"];
    expect(Object.keys(on).sort()).toEqual(["push", "workflow_dispatch"]);
    expect(on.push.tags).toEqual(["@relate/contrib-*@*"]);
    expect(on.push.branches).toBeUndefined();
  });

  it("does not cancel a release that is running, and waits for it", () => {
    expect(wf["concurrency"]["cancel-in-progress"]).toBe(false);
  });

  it("runs the jobs in order: resolve, checks, gate, publish", () => {
    const jobs = wf["jobs"];
    expect(Object.keys(jobs)).toEqual(["resolve", "checks", "gate", "publish"]);
    expect(jobs.checks.needs).toEqual("resolve");
    expect(jobs.gate.needs).toEqual(["resolve", "checks"]);
    expect(jobs.publish.needs).toEqual(["resolve", "checks", "gate"]);
  });

  it("gives the id-token permission and the environment to the publish job only, and runs it only for a real release", () => {
    const jobs = wf["jobs"];
    for (const name of ["resolve", "checks", "gate"]) {
      expect(jobs[name].permissions?.["id-token"], name).toBeUndefined();
      expect(jobs[name].environment, name).toBeUndefined();
    }
    expect(wf["permissions"]["id-token"]).toBeUndefined(); // read-only contents for the workflow as a whole
    expect(jobs.publish.permissions["id-token"]).toBe("write");
    expect(jobs.publish.environment).toBe("npm-publish");
    expect(jobs.publish.if).toContain("real == 'true'");
  });

  it("turns a tag push into a rehearsal unless PUBLISHING_ENABLED is true, and a manual start is always a rehearsal", () => {
    const run: string = wf["jobs"].resolve.steps.find((s: any) => s.id === "what").run;
    expect(run).toContain('"$PUBLISHING_ENABLED" = "true"');
    expect(run).toMatch(/else\s+echo "package=\$INPUT_PACKAGE"[\s\S]*real=false/);
  });

  it("publishes with no stored token: no registry token secret, a pinned npm of 11.5.1 or later, a tarball made by pack", () => {
    const text = readFileSync(join(repoRoot(), ".github/workflows/release.yml"), "utf8");
    expect(text).not.toMatch(/NODE_AUTH_TOKEN|NPM_TOKEN|secrets\.NPM/);
    expect(text).toContain("npm install -g npm@11.15.0");
    expect(text).toContain("npm publish \"$tarball\" --access public --provenance");
    expect(text).toContain("pnpm --filter \"$name\" pack");
  });

  it("reports what was published when a step fails, and stops at the gate before publishing", () => {
    const steps = wf["jobs"].publish.steps;
    expect(steps.at(-1).if).toBe("always()");
    expect(wf["jobs"].publish.needs).toContain("gate");
  });
});
