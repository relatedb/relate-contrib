// Package resolution for loaders (research D-1): from the site's root, which Framework gives a loader as its working directory.
import { createRequire } from "node:module";
import { join } from "node:path";

/** The path a site's own installed package `specifier` resolves to, starting from `root` (default: the working directory). */
export function resolveFromSite(specifier: string, root: string = process.cwd()): string {
  return createRequire(join(root, "package.json")).resolve(specifier);
}
