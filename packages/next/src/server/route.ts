// The route builder (spec FR-005, FR-006, FR-009, ADR-005 §2.2). Used from `app/related-web/[id]/[file]/route.ts`.
import { descriptorOf } from "related-web-core/build";
import { Evaluations, OWNER, declare, isDevelopment, registeredNames } from "./graphs.js";
import type { Graphs } from "./graphs.js";

/** Where the files are published, below the site's base path. The route file's folder names must match. */
export const ROUTE = "/related-web";
export const descriptorPath = (id: string): string => `${ROUTE}/${id}/descriptor.json`;
export const dataPath = (id: string, revision: string): string => `${ROUTE}/${id}/graph.${revision}.json`;

export const basePath = (): string => process.env.RELATED_WEB_BASE_PATH ?? "";

interface Params {
  id: string;
  file: string;
}

const notFound = (): Response => new Response("not found", { status: 404, headers: { "content-type": "text/plain; charset=utf-8" } });
const json = (body: string): Response => new Response(body + "\n", { headers: { "content-type": "application/json; charset=utf-8" } });

export function createGraphRoute(graphs: Graphs) {
  const registered = new Map(declare(graphs).map((g) => [g.id, g]));
  for (const id of registered.keys()) registeredNames.add(id);
  const evaluations = new Evaluations(registered);

  async function generateStaticParams(): Promise<Params[]> {
    const params: Params[] = [];
    for (const id of registered.keys()) {
      params.push({ id, file: "descriptor.json" });
      try {
        params.push({ id, file: `graph.${(await evaluations.get(id)).revision}.json` });
      } catch (e) {
        // A build stops at the first problem. The development server keeps running and answers this graph's files with an error.
        if (!isDevelopment()) throw e;
        console.error(e instanceof Error ? e.message : String(e));
      }
    }
    return params;
  }

  async function GET(_request: Request, context: { params: Promise<Params> }): Promise<Response> {
    const { id, file } = await context.params;
    const graph = registered.get(id);
    if (!graph) return notFound();
    let evaluated;
    try {
      evaluated = await evaluations.get(id);
    } catch (e) {
      // The development server answers with the message; a build fails.
      if (!isDevelopment()) throw e;
      return new Response(e instanceof Error ? e.message : String(e), { status: 500, headers: { "content-type": "text/plain; charset=utf-8" } });
    }
    if (file === "descriptor.json") {
      return json(JSON.stringify(descriptorOf(id, evaluated, graph.indexes, basePath(), dataPath(id, evaluated.revision))));
    }
    const match = /^graph\.([0-9a-f]{12})\.json$/.exec(file);
    if (!match) return notFound();
    if (match[1] !== evaluated.revision) {
      // Next builds in several processes, so the process that lists a file and the one that serves it evaluate separately.
      // The same source gives the same revision in both, or the source is not deterministic and the build must stop (FR-009).
      if (isDevelopment()) return notFound();
      throw new Error(`${OWNER}: graph "${id}": revision mismatch for ${file}: this evaluation gave ${evaluated.revision}; the graph's source is not deterministic`);
    }
    return json(evaluated.text);
  }

  return { GET, generateStaticParams };
}
