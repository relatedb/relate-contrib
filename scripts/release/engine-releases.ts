// Which engine releases have not been tested? (FR-018, FR-021; research R5; data-model.md `Engine release`.) A release is tested once;
// its result is recorded as the git tag `engine-tested/<version>`. A prerelease or deprecated release is never tested as a supported one.
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import semver from "semver";
import { isRelease } from "./lib/ranges.js";
import { DEFAULT_REGISTRY, fetchVersions } from "./lib/registry.js";
import { ENGINE } from "./lib/workspace.js";

export const TESTED_TAG_PREFIX = "engine-tested/";

/** The untested supported engine releases, oldest first. */
export function untestedReleases(published: string[], deprecated: string[], tested: string[]): string[] {
  const done = new Set(tested);
  return [...new Set(published)]
    .filter((v) => isRelease(v) && !deprecated.includes(v) && !done.has(v))
    .sort((a, b) => semver.compare(a, b));
}

/** The versions already tested, from the tag names (`engine-tested/<version>`). */
export const testedFromTags = (tags: string[]): string[] => tags.filter((t) => t.startsWith(TESTED_TAG_PREFIX)).map((t) => t.slice(TESTED_TAG_PREFIX.length));

function readTags(source: string | undefined): string[] {
  if (source && existsSync(source)) return readFileSync(source, "utf8").split("\n").map((s) => s.trim()).filter(Boolean);
  try {
    return execFileSync("git", ["tag", "--list", `${TESTED_TAG_PREFIX}*`], { encoding: "utf8" }).split("\n").filter(Boolean);
  } catch {
    return [];
  }
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const flag = (n: string): string | undefined => (args.includes(n) ? args[args.indexOf(n) + 1] : undefined);
  const found = await fetchVersions(ENGINE, flag("--registry") ?? DEFAULT_REGISTRY);
  if (found.status === "unreachable") {
    console.error(`engine-releases: the registry could not be reached: ${found.detail}`);
    process.exit(1);
  }
  if (found.status === "absent") process.exit(0); // the engine is not published yet: nothing to test
  const all = untestedReleases(found.versions, found.deprecated, testedFromTags(readTags(flag("--tags"))));
  const only = flag("--version");
  for (const v of only ? all.filter((x) => x === only) : all) console.log(v);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) void main();
