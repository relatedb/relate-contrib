// Runs every package's traceability checks from the reports of earlier jobs, without installing the packages: each check is a plain
// script that reads reports and the specification, so it runs from its package's folder with the root's tools.
import { readdirSync, readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { join } from "node:path";
import { repoRoot } from "./lib/workspace.js";

const root = repoRoot();
const bin = join(root, "node_modules/.bin");
let failed = 0;
for (const d of readdirSync(join(root, "packages")).sort()) {
  let manifest: { name?: string; scripts?: Record<string, string> };
  try { manifest = JSON.parse(readFileSync(join(root, "packages", d, "package.json"), "utf8")); } catch { continue; }
  for (const [script, cmd] of Object.entries(manifest.scripts ?? {})) {
    if (!/^test:([a-z-]+-)?trace$/.test(script)) continue;
    console.log(`::group::${manifest.name}: ${script}`);
    const r = spawnSync("bash", ["-c", cmd], { cwd: join(root, "packages", d), stdio: "inherit", env: { ...process.env, PATH: `${bin}:${process.env["PATH"]}` } });
    console.log("::endgroup::");
    if (r.status !== 0) { failed++; console.error(`${manifest.name}: ${script} failed`); }
  }
}
const r = spawnSync("bash", ["-c", "tsx scripts/release/trace/check-trace.ts"], { cwd: root, stdio: "inherit", env: { ...process.env, PATH: `${bin}:${process.env["PATH"]}` } });
if (r.status !== 0) { failed++; console.error("scripts/release: trace failed"); }
process.exit(failed ? 1 : 0);
