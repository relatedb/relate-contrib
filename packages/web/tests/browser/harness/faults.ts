// Fault injection for the browser tests. Nothing here is shipped: the faults come from statements, from
// workers the tests create, and from data that cannot be fetched.

/** A statement with about a thousand nested parentheses traps the engine (SPIKE-004; verified against this build at depth 500). */
export const trapStatement = (depth = 200000): string => `RETURN ${"1+".repeat(depth)}1 AS x`;

/** A three-way cartesian count over a 1,000-page graph runs far longer than any timeout used in the tests. */
export const runawayStatement = "MATCH (a:Page), (b:Page), (c:Page) RETURN count(*) AS c";

/** A descriptor whose data cannot be fetched: every attempt to load fails in the worker. */
export const unreachableDescriptor = (id = "unreachable") => ({
  version: 1 as const,
  id,
  revision: "r1",
  data: { url: `/data/${id}-missing.json`, nodes: 1, links: 0 },
});

/**
 * A worker factory that creates the real worker and remembers every worker it made, so a test can count attempts
 * and dispatch an error event on a worker (the client treats it like a worker that failed).
 */
export function trackedWorkers(): { factory: () => Worker; workers: Worker[]; failLatest: (message?: string) => void } {
  const workers: Worker[] = [];
  return {
    workers,
    factory: () => {
      const worker = new Worker(new URL("../../../dist/worker/worker.js", import.meta.url), { type: "module" });
      workers.push(worker);
      return worker;
    },
    failLatest: (message = "injected worker error") => {
      workers.at(-1)?.dispatchEvent(new ErrorEvent("error", { message }));
    },
  };
}
