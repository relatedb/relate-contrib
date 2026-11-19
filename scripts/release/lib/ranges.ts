// Engine ranges, of the form `>=OLDEST <=NEWEST` (ADR-013 2.1; data-model.md `Engine range`).
import semver from "semver";

export interface EngineRange {
  oldest: string;
  newest: string;
}

export type Parsed = { ok: true; value: EngineRange } | { ok: false; reason: string };

export const EXPECTED_FORM = ">=OLDEST <=NEWEST, both full versions";

/** Parse a peer range on the engine. "Any version" and every other form are refused with a reason. */
export function parseEngineRange(range: string | undefined): Parsed {
  if (range === undefined) return { ok: false, reason: "there is no engine range" };
  const text = range.trim();
  if (text === "*" || text === "" || text === "x" || text === "latest") return { ok: false, reason: 'the peer is "any version"' };
  const m = /^>=\s*(\d+\.\d+\.\d+)\s+<=\s*(\d+\.\d+\.\d+)$/.exec(text);
  if (!m) return { ok: false, reason: `expected ${EXPECTED_FORM}, found "${range}"` };
  const [oldest, newest] = [m[1]!, m[2]!];
  if (semver.prerelease(oldest) || semver.prerelease(newest)) return { ok: false, reason: "a prerelease cannot end an engine range" };
  if (semver.gt(oldest, newest)) return { ok: false, reason: `OLDEST ${oldest} is above NEWEST ${newest}` };
  return { ok: true, value: { oldest, newest } };
}

/** Does the range include the version? */
export const includesVersion = (range: EngineRange, version: string): boolean =>
  semver.gte(version, range.oldest) && semver.lte(version, range.newest);

export const formatRange = (range: EngineRange): string => `>=${range.oldest} <=${range.newest}`;

/** Is `a` a full release version (no prerelease, no build part)? */
export const isRelease = (version: string): boolean => semver.valid(version) !== null && !semver.prerelease(version);
