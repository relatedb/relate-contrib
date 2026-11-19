// Point a checkout at an engine release from the registry, for the engine-release run (research R11): remove the override that links
// the vendored build, and set the catalog's `relate-wasm` to the version. Edits the working tree only; the result is never committed.
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import YAML from "yaml";
import { isRelease } from "./lib/ranges.js";
import { ENGINE, repoRoot } from "./lib/workspace.js";

export function useEngine(root: string, version: string): void {
  if (!isRelease(version)) throw new Error(`"${version}" is not a release version of the engine`);
  const file = join(root, "pnpm-workspace.yaml");
  const doc = YAML.parseDocument(readFileSync(file, "utf8"));
  doc.deleteIn(["overrides", ENGINE]);
  if (doc.hasIn(["overrides"]) && (doc.getIn(["overrides"]) as YAML.YAMLMap).items.length === 0) doc.delete("overrides");
  doc.setIn(["catalog", "@relate/relate-wasm"], version);
  writeFileSync(file, String(doc));
}

function main(): void {
  const version = process.argv[2];
  if (!version) {
    console.error("use-engine: an engine version is required");
    process.exit(2);
  }
  try {
    useEngine(repoRoot(), version);
  } catch (err) {
    console.error(`use-engine: ${err instanceof Error ? err.message : String(err)}`);
    process.exit(1);
  }
  console.log(`use-engine: the workspace now takes the engine ${version} from the registry`);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) main();
