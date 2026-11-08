// covers: FR-004
import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterAll, describe, expect, it } from "vitest";
import { resolveFromSite } from "../../src/loader/resolve.js";

const dirs: string[] = [];
const site = (): string => {
  const dir = realpathSync(mkdtempSync(join(tmpdir(), "rel-site-")));
  dirs.push(dir);
  writeFileSync(join(dir, "package.json"), '{"name":"site","type":"module"}');
  return dir;
};
afterAll(() => dirs.forEach((d) => rmSync(d, { recursive: true, force: true })));

describe("loader package resolution (research D-1)", () => {
  it("resolves a package from the site's root, not from the adapter's location", () => {
    const root = site();
    mkdirSync(join(root, "node_modules/stub-pkg"), { recursive: true });
    writeFileSync(join(root, "node_modules/stub-pkg/package.json"), '{"name":"stub-pkg","main":"index.js"}');
    writeFileSync(join(root, "node_modules/stub-pkg/index.js"), "module.exports = 1;");
    expect(resolveFromSite("stub-pkg", root)).toBe(join(root, "node_modules/stub-pkg/index.js"));
  });

  it("uses the working directory by default", () => {
    const root = site();
    mkdirSync(join(root, "node_modules/stub-cwd"), { recursive: true });
    writeFileSync(join(root, "node_modules/stub-cwd/package.json"), '{"name":"stub-cwd","main":"index.js"}');
    writeFileSync(join(root, "node_modules/stub-cwd/index.js"), "module.exports = 1;");
    const here = process.cwd();
    process.chdir(root);
    try {
      expect(resolveFromSite("stub-cwd")).toMatch(/stub-cwd\/index\.js$/);
    } finally {
      process.chdir(here);
    }
  });

  it("throws for a package the site does not have", () => {
    expect(() => resolveFromSite("no-such-package-here", site())).toThrow();
  });
});

describe("a failing loader", () => {
  it("writes the message to standard error, nothing to standard output, and exits non-zero", () => {
    const script = fileURLToPath(new URL("../fixtures/fail-script.ts", import.meta.url));
    const run = spawnSync(process.execPath, ["--import", "tsx", script], { encoding: "utf8" });
    expect(run.status).toBe(1);
    expect(run.stdout).toBe("");
    expect(run.stderr).toBe('graph "demo": data.nodes[2].id: must be a string\n');
  });
});
