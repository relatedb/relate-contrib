// The checks a release runs for a package (FR-014): its unit, clean-install package and traceability commands, found by name in its
// manifest's scripts. A package's folder is `packages/<folder>`; its commands are `test:unit` or `test:<folder>`, `test:package` or
// `test:<folder>-package`, and `test:trace` or `test:<folder>-trace`, run from the package's folder.
import { fileURLToPath } from "node:url";
import { findPackage, loadPackages, repoRoot } from "./lib/workspace.js";

export function checksFor(root: string, name: string): string[] {
  const pkg = findPackage(loadPackages(root), name);
  if (!pkg) return [];
  const folder = pkg.folder.replace("packages/", "");
  const scripts = pkg.manifest["scripts"] as Record<string, string> | undefined ?? {};
  const out: string[] = [];
  // the traceability check reads every report, so the browser and conformance runs come before it; a folder may be named in a
  // script by a shorter form (`nextjs` is `next`)
  const names = [folder, folder.replace(/js$/, "")];
  for (const kind of ["", "-browsers", "-conformance", "-package", "-trace"]) {
    const generic = kind === "" ? "test:unit" : `test${kind.replace("-", ":")}`;
    const script = [...names.map((n) => `test:${n}${kind}`), generic].find((s) => scripts[s] !== undefined);
    if (script) out.push(script);
  }
  return out;
}

function main(): void {
  const name = process.argv[2];
  if (!name) {
    console.error("checks-for: a package name is required");
    process.exit(2);
  }
  for (const s of checksFor(repoRoot(), name)) console.log(s);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) main();
