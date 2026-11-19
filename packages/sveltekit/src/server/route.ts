// The route builder (spec FR-005 to FR-010, ADR-007 §2.2). Used from `src/routes/relate/[id]/[file]/+server.ts`.
import { descriptorOf } from "@relate/contrib-web/build";
import type { Evaluated } from "@relate/contrib-web/build";
import { OWNER, declare, evaluateSource, isDevelopment } from "./graphs.js";
import type { Graphs, Registered } from "./graphs.js";

/** The route's folder under `src/routes`; the site's route file must sit in `relate/[id]/[file]`. */
const SEGMENT = "/relate/";

interface RouteEvent {
  params: { id: string; file: string };
  url: URL;
}

const notFound = (): Response => new Response("not found", { status: 404, headers: { "content-type": "text/plain; charset=utf-8" } });
const json = (body: string): Response => new Response(body + "\n", { headers: { "content-type": "application/json; charset=utf-8" } });

export function createGraphRoute(graphs: Graphs) {
  const registered = new Map<string, Registered>(declare(graphs).map((g) => [g.id, g]));
  const evaluations = new Map<string, Promise<Evaluated>>();

  /** In production a source is evaluated once and the result kept, so the names listed and the files served come from one evaluation. */
  const evaluated = (id: string): Promise<Evaluated> => {
    const graph = registered.get(id)!;
    if (isDevelopment()) return evaluateSource(graph);
    let pending = evaluations.get(id);
    if (!pending) evaluations.set(id, (pending = evaluateSource(graph)));
    return pending;
  };

  async function entries(): Promise<Array<{ id: string; file: string }>> {
    const out: Array<{ id: string; file: string }> = [];
    for (const graph of registered.values()) {
      // `entries()` and every `GET` share one process, so a source that varies cannot be caught between processes (SPIKE-007 5.5):
      // evaluate it twice, independently, and compare.
      const first = await evaluateSource(graph);
      const second = await evaluateSource(graph);
      if (first.text !== second.text) throw new Error(`${OWNER}: graph "${graph.id}": the source is not deterministic: two evaluations of it differ`);
      if (!isDevelopment()) evaluations.set(graph.id, Promise.resolve(first));
      out.push({ id: graph.id, file: "descriptor.json" }, { id: graph.id, file: `graph.${first.revision}.json` });
    }
    return out;
  }

  async function GET({ params, url }: RouteEvent): Promise<Response> {
    const graph = registered.get(params.id);
    const at = url.pathname.indexOf(SEGMENT);
    if (!graph || at < 0) return notFound();
    const base = url.pathname.slice(0, at);
    let result: Evaluated;
    try {
      result = await evaluated(params.id);
    } catch (e) {
      // `entries()` has already evaluated every source when a site is built, so a failure here happens when the server runs: in
      // development, or for a page rendered on demand. Answer with the message; the build is what refuses a bad source.
      return new Response(e instanceof Error ? e.message : String(e), { status: 500, headers: { "content-type": "text/plain; charset=utf-8" } });
    }
    if (params.file === "descriptor.json") {
      return json(JSON.stringify(descriptorOf(graph.id, result, graph.indexes, base, `${SEGMENT}${graph.id}/graph.${result.revision}.json`)));
    }
    if (params.file === `graph.${result.revision}.json`) return json(result.text.replace(/\n$/, ""));
    return notFound(); // another revision, or a file that is not declared
  }

  return { GET, entries };
}
