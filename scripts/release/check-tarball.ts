// A packed tarball must contain every file its manifest points to (main, module, types, bin, exports), so that a package whose build
// did not run is never published (ADR-013).
//
// usage: tsx scripts/release/check-tarball.ts <tarball.tgz>
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";

/** Every relative file path a manifest names as an entry point. */
export function entryTargets(manifest: Record<string, unknown>): string[] {
  const out = new Set<string>();
  const visit = (v: unknown): void => {
    if (typeof v === "string") {
      if (v.startsWith("./") || /^[\w@][^*]*\.\w+$/.test(v)) out.add(v.replace(/^\.\//, ""));
    } else if (v && typeof v === "object") for (const x of Object.values(v)) visit(x);
  };
  for (const key of ["main", "module", "types", "bin", "exports"]) visit(manifest[key]);
  return [...out].filter((t) => !t.includes("*")).sort();
}

/** The entry points a tarball's file list does not contain. */
export function missingTargets(manifest: Record<string, unknown>, files: string[]): string[] {
  const have = new Set(files.map((f) => f.replace(/^package\//, "")));
  return entryTargets(manifest).filter((t) => !have.has(t));
}

function main(): void {
  const tarball = process.argv[2];
  if (!tarball) {
    console.error("check-tarball: a tarball path is required");
    process.exit(2);
  }
  const files = execFileSync("tar", ["-tzf", tarball], { encoding: "utf8" }).split("\n").filter(Boolean);
  const manifest = JSON.parse(execFileSync("tar", ["-xzOf", tarball, "package/package.json"], { encoding: "utf8" })) as Record<string, unknown>;
  const missing = missingTargets(manifest, files);
  if (missing.length) {
    console.error(`check-tarball: ${String(manifest.name)} is missing files its manifest points to (was it built?): ${missing.join(", ")}`);
    process.exit(1);
  }
  console.log(`check-tarball: ${String(manifest.name)}@${String(manifest.version)}: ${entryTargets(manifest).length} entry points present, ${files.length} files`);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) main();
