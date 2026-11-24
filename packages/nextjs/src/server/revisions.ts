// The revisions a build published, recorded in the build output so the server can answer a file it never published with 404
// without evaluating the graph (ADR-005 §2.2). Under `cacheComponents` a request for a file that was not listed is rendered
// on demand, and evaluating a source there is IO Next refuses ("used IO that was not cached"), which answered 500, not 404.
import { mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";

const FILE = "relate-revisions.json";

const location = (): string => join(process.cwd(), process.env.RELATE_NEXTJS_DIST_DIR ?? ".next", FILE);

function read(path: string): Record<string, string> | undefined {
  try {
    const parsed: unknown = JSON.parse(readFileSync(path, "utf8"));
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? (parsed as Record<string, string>) : undefined;
  } catch {
    return undefined;
  }
}

/** Called by a build when it lists a graph's file. Best effort: a build that cannot write leaves the server to evaluate. */
export function recordRevision(id: string, revision: string): void {
  try {
    const path = location();
    const all = read(path) ?? {};
    if (all[id] === revision) return;
    all[id] = revision;
    mkdirSync(dirname(path), { recursive: true });
    const tmp = `${path}.${process.pid}.tmp`;
    writeFileSync(tmp, JSON.stringify(all));
    renameSync(tmp, path);
  } catch {
    /* not recorded */
  }
}

/** The revision the build published for the graph, or undefined when the build left no record (then the source is evaluated). */
export function publishedRevision(id: string): string | undefined {
  return read(location())?.[id];
}
