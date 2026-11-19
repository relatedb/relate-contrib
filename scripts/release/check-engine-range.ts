// Does each package state the engine it supports, and does that agree with the engine the workspace is built on? (FR-006 to FR-008;
// ADR-013 2.1; data-model.md `Engine range`, `Supported engine`, `Peer window on the core`.)
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import YAML from "yaml";
import { EXPECTED_FORM, includesVersion, isRelease, parseEngineRange } from "./lib/ranges.js";
import { CORE, ENGINE, ENGINE_LOADERS, loadPackages, repoRoot } from "./lib/workspace.js";
import type { Finding } from "./check-publishable.js";

const CORE_WINDOW = /^>=\d+\.\d+\.\d+ <1\.0\.0$/;

/** The supported engine: the workspace catalog's entry for the engine, or undefined when there is none. */
export function supportedEngine(root: string): string | undefined {
  const file = join(root, "pnpm-workspace.yaml");
  if (!existsSync(file)) return undefined;
  const doc = YAML.parse(readFileSync(file, "utf8")) as { catalog?: Record<string, string> } | null;
  const v = doc?.catalog?.["@relate/relate-wasm"];
  return v === undefined ? undefined : String(v);
}

export function checkEngineRange(root: string): Finding[] {
  const findings: Finding[] = [];
  const add = (pkg: string, rule: string, detail: string) => findings.push({ package: pkg, rule, detail });
  const engine = supportedEngine(root);
  if (engine === undefined) add("(workspace)", "supported-engine", "pnpm-workspace.yaml has no catalog entry `@relate/relate-wasm` naming the supported engine");
  else if (!isRelease(engine)) add("(workspace)", "supported-engine", `the supported engine "${engine}" is not a full release version`);
  const vendored = join(root, "vendor/relate-wasm/pkg/package.json");
  if (engine !== undefined && existsSync(vendored)) {
    const v = (JSON.parse(readFileSync(vendored, "utf8")) as { version?: string }).version;
    if (v !== engine) add("(workspace)", "supported-engine", `the catalog names engine ${engine} but the vendored engine package is ${v}`);
  }
  for (const p of loadPackages(root)) {
    const peers = p.manifest.peerDependencies ?? {};
    const range = peers[ENGINE];
    if (ENGINE_LOADERS.includes(p.name)) {
      const parsed = parseEngineRange(range);
      if (!parsed.ok) add(p.name, "engine-range", parsed.reason);
      else if (engine !== undefined && isRelease(engine) && !includesVersion(parsed.value, engine)) {
        add(p.name, "engine-range", `the range ${range} does not include the supported engine ${engine}`);
      }
    } else if (range !== undefined) {
      add(p.name, "engine-peer", `reaches the engine through the core and must not declare ${ENGINE} (found "${range}"); expected ${EXPECTED_FORM} only where it loads the engine`);
    }
    if (p.name !== CORE) {
      const core = peers[CORE];
      if (core === undefined) add(p.name, "core-window", `no peer on ${CORE}`);
      else if (!CORE_WINDOW.test(core)) add(p.name, "core-window", `the peer on ${CORE} is "${core}"; expected a window like ">=0.1.0 <1.0.0"`);
    }
  }
  return findings;
}

function main(): void {
  const findings = checkEngineRange(repoRoot());
  if (process.argv.includes("--json")) console.log(JSON.stringify(findings));
  for (const f of findings) console.error(`${f.package}: ${f.rule}: ${f.detail}`);
  if (!process.argv.includes("--json")) console.log(findings.length === 0 ? "check-engine-range: passed" : `check-engine-range: ${findings.length} finding(s)`);
  process.exit(findings.length === 0 ? 0 : 1);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) main();
