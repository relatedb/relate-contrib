// The workspace's packages, as the release scripts see them (ADR-013, spec 010). Reads `packages/*/package.json` under a root
// folder (the repository, or a scratch workspace in a test) and orders the packages for a release: the core first.
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

export const CORE = "@relate/contrib-web";
export const ENGINE = "@relate/relate-wasm";

/** The packages that load the engine themselves, and so declare an engine range (research R2). The others reach it through the core. */
export const ENGINE_LOADERS = [
  "@relate/contrib-web",
  "@relate/contrib-astro",
  "@relate/contrib-nextjs",
  "@relate/contrib-observable",
  "@relate/contrib-sveltekit",
];

export interface Manifest {
  name: string;
  version: string;
  private?: boolean;
  license?: string;
  repository?: { type?: string; url?: string; directory?: string } | string;
  homepage?: string;
  keywords?: string[];
  publishConfig?: { access?: string };
  files?: string[];
  peerDependencies?: Record<string, string>;
  peerDependenciesMeta?: Record<string, { optional?: boolean }>;
  devDependencies?: Record<string, string>;
  [key: string]: unknown;
}

export interface Pkg {
  name: string;
  /** The package's folder relative to the root, such as `packages/web`. */
  folder: string;
  /** The package's folder, absolute. */
  dir: string;
  manifest: Manifest;
}

/** The repository's root, two folders above `scripts/release/lib`. */
export const repoRoot = (): string => resolve(dirname(fileURLToPath(import.meta.url)), "../../..");

/** Every package under `<root>/packages` whose manifest names a `@relate/` package. */
export function loadPackages(root: string = repoRoot()): Pkg[] {
  const base = join(root, "packages");
  if (!existsSync(base)) return [];
  const out: Pkg[] = [];
  for (const entry of readdirSync(base, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    const file = join(base, entry.name, "package.json");
    if (!existsSync(file)) continue;
    const manifest = JSON.parse(readFileSync(file, "utf8")) as Manifest;
    if (typeof manifest.name !== "string" || !manifest.name.startsWith("@relate/")) continue;
    out.push({ name: manifest.name, folder: `packages/${entry.name}`, dir: join(base, entry.name), manifest });
  }
  return out;
}

/** The order of a release: the core first, then every other package by name (all of them peer on the core, and on nothing else of ours). */
export function releaseOrder(packages: Pkg[]): Pkg[] {
  return [...packages].sort((a, b) => (a.name === CORE ? -1 : b.name === CORE ? 1 : a.name.localeCompare(b.name)));
}

/** A package by name, or undefined. */
export const findPackage = (packages: Pkg[], name: string): Pkg | undefined => packages.find((p) => p.name === name);
