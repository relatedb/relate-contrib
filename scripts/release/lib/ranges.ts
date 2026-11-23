// Engine ranges, of the form `>=OLDEST <=NEWEST`, or `>=OLDEST <NEXT` where NEXT is a minor boundary (`X.Y.0`) so that every patch
// release below it is supported (ADR-013 2.1; data-model.md `Engine range`).
import semver from "semver";

export interface EngineRange {
  oldest: string;
  /** The upper end: the newest supported release, or (when `exclusive`) the minor boundary no supported release reaches. */
  newest: string;
  /** The upper end is `<newest`, a minor boundary `X.Y.0`: every patch release of the minors below it is supported. */
  exclusive?: boolean;
}

export type Parsed = { ok: true; value: EngineRange } | { ok: false; reason: string };

export const EXPECTED_FORM = ">=OLDEST <=NEWEST, both full versions, or >=OLDEST <NEXT with NEXT a minor boundary (X.Y.0)";

/** Parse a peer range on the engine. "Any version" and every other form are refused with a reason. */
export function parseEngineRange(range: string | undefined): Parsed {
  if (range === undefined) return { ok: false, reason: "there is no engine range" };
  const text = range.trim();
  if (text === "*" || text === "" || text === "x" || text === "latest") return { ok: false, reason: 'the peer is "any version"' };
  const m = /^>=\s*(\d+\.\d+\.\d+)\s+(<=?)\s*(\d+\.\d+\.\d+)$/.exec(text);
  if (!m) return { ok: false, reason: `expected ${EXPECTED_FORM}, found "${range}"` };
  const [oldest, newest] = [m[1]!, m[3]!];
  const exclusive = m[2] === "<";
  if (semver.prerelease(oldest) || semver.prerelease(newest)) return { ok: false, reason: "a prerelease cannot end an engine range" };
  if (exclusive && semver.patch(newest) !== 0) return { ok: false, reason: `an exclusive upper end must be a minor boundary (X.Y.0), found ${newest}` };
  if (exclusive ? semver.gte(oldest, newest) : semver.gt(oldest, newest)) return { ok: false, reason: `OLDEST ${oldest} is above the upper end ${newest}` };
  return { ok: true, value: exclusive ? { oldest, newest, exclusive } : { oldest, newest } };
}

/** Does the range include the version? */
export const includesVersion = (range: EngineRange, version: string): boolean =>
  semver.gte(version, range.oldest) && (range.exclusive ? semver.lt(version, range.newest) : semver.lte(version, range.newest));

/** The minor boundary above a release: 1.2.3 gives 1.3.0. */
export const nextMinor = (version: string): string => `${semver.major(version)}.${semver.minor(version) + 1}.0`;

export const formatRange = (range: EngineRange): string => `>=${range.oldest} ${range.exclusive ? "<" : "<="}${range.newest}`;

/** Is `a` a full release version (no prerelease, no build part)? */
export const isRelease = (version: string): boolean => semver.valid(version) !== null && !semver.prerelease(version);
