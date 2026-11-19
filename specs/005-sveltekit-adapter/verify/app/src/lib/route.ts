// A stand-in for createGraphRoute: entries() evaluates each source twice, independently; the base path comes from the request;
// in development GET evaluates on each request and a revision that is not current is 404.
import { descriptorOf, evaluate, type Evaluated } from "@relate/contrib-web/build";
import { dev } from "$app/environment";
import { error } from "@sveltejs/kit";

export type Graphs = Record<string, { source: () => unknown; indexes?: Array<{ label: string; property: string }> }>;
const OWNER = "@relate/spike";

export function createGraphRoute(graphs: Graphs) {
  const cache = new Map<string, Promise<Evaluated>>();
  const get = (id: string): Promise<Evaluated> => {
    if (dev) return evaluate(OWNER, id, graphs[id]!.source);
    let pending = cache.get(id);
    if (!pending) cache.set(id, (pending = evaluate(OWNER, id, graphs[id]!.source)));
    return pending;
  };
  return {
    async entries() {
      const out: Array<{ id: string; file: string }> = [];
      for (const id of Object.keys(graphs)) {
        const [a, b] = [await evaluate(OWNER, id, graphs[id]!.source), await evaluate(OWNER, id, graphs[id]!.source)];
        if (a.text !== b.text) throw new Error(`${OWNER}: graph "${id}": the source is not deterministic: two evaluations differ`);
        out.push({ id, file: "descriptor.json" }, { id, file: `graph.${a.revision}.json` });
      }
      return out;
    },
    async GET({ params, url }: { params: { id: string; file: string }; url: URL }) {
      if (!graphs[params.id]) error(404, "not found");
      const base = url.pathname.slice(0, url.pathname.indexOf("/relate/"));
      const evaluated = await get(params.id);
      const headers = { "content-type": "application/json; charset=utf-8" };
      if (params.file === "descriptor.json") return new Response(JSON.stringify(descriptorOf(params.id, evaluated, graphs[params.id]!.indexes ?? [], base, `/relate/${params.id}/graph.${evaluated.revision}.json`)) + "\n", { headers });
      if (params.file === `graph.${evaluated.revision}.json`) return new Response(evaluated.text, { headers });
      error(404, "not found");
    },
  };
}
