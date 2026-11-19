// A registered graph's descriptor and revision-named data file, published by a prerendered endpoint (the route a SvelteKit adapter would ask the site to add).
import { descriptorOf, evaluate, type Evaluated } from "@relate/contrib-web/build";
import { error } from "@sveltejs/kit";

export const prerender = true;

const graphs: Record<string, () => unknown> = {
  example: () => ({ version: 1, nodes: Array.from({ length: 30 }, (_, i) => ({ id: `p${i}`, labels: ["Page"] })), links: [] }),
};

const evaluations = new Map<string, Promise<Evaluated>>();
const get = (id: string): Promise<Evaluated> => {
  let pending = evaluations.get(id);
  if (!pending) evaluations.set(id, (pending = evaluate("@relate/spike", id, graphs[id]!)));
  return pending;
};

export async function entries() {
  console.log(`[entries] pid ${process.pid} phase ${process.env.NODE_ENV}`);
  const out: Array<{ id: string; file: string }> = [];
  for (const id of Object.keys(graphs)) out.push({ id, file: "descriptor.json" }, { id, file: `graph.${(await get(id)).revision}.json` });
  return out;
}

export async function GET({ params }: { params: { id: string; file: string } }) {
  console.log(`[GET ${params.id}/${params.file}] pid ${process.pid}`);
  if (!graphs[params.id]) error(404, "not found");
  const evaluated = await get(params.id);
  const headers = { "content-type": "application/json; charset=utf-8" };
  if (params.file === "descriptor.json") return new Response(JSON.stringify(descriptorOf(params.id, evaluated, [], "", `/relate/${params.id}/graph.${evaluated.revision}.json`)) + "\n", { headers });
  if (params.file === `graph.${evaluated.revision}.json`) return new Response(evaluated.text, { headers });
  error(404, "not found");
}
