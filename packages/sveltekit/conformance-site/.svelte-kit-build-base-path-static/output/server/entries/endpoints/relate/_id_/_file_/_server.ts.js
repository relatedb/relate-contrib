import { a as isDevelopment, i as evaluateSource, n as OWNER, r as declare, t as graphs } from "../../../../../chunks/graphs.js";
// ../../web/dist/build/descriptor.js
/** The base path of a site joined with a path of the adapter's, without a doubled slash. */
var withBase = (base, path) => `${base.replace(/\/+$/, "")}${path}`;
/** `dataPath` is the published location of the data file, without the base path. */
function descriptorOf(name, evaluated, indexes, base, dataPath) {
	return {
		version: 1,
		id: name,
		revision: evaluated.revision,
		data: {
			url: withBase(base, dataPath),
			nodes: evaluated.nodes,
			links: evaluated.links
		},
		...indexes.length ? { indexes } : {}
	};
}
// ../dist/server/route.js
/** The route's folder under `src/routes`; the site's route file must sit in `relate/[id]/[file]`. */
var SEGMENT = "/relate/";
var notFound = () => new Response("not found", {
	status: 404,
	headers: { "content-type": "text/plain; charset=utf-8" }
});
var json = (body) => new Response(body + "\n", { headers: { "content-type": "application/json; charset=utf-8" } });
function createGraphRoute(graphs) {
	const registered = new Map(declare(graphs).map((g) => [g.id, g]));
	const evaluations = /* @__PURE__ */ new Map();
	/** In production a source is evaluated once and the result kept, so the names listed and the files served come from one evaluation. */
	const evaluated = (id) => {
		const graph = registered.get(id);
		if (isDevelopment()) return evaluateSource(graph);
		let pending = evaluations.get(id);
		if (!pending) evaluations.set(id, pending = evaluateSource(graph));
		return pending;
	};
	async function entries() {
		const out = [];
		for (const graph of registered.values()) {
			const first = await evaluateSource(graph);
			const second = await evaluateSource(graph);
			if (first.text !== second.text) throw new Error(`${OWNER}: graph "${graph.id}": the source is not deterministic: two evaluations of it differ`);
			if (!isDevelopment()) evaluations.set(graph.id, Promise.resolve(first));
			out.push({
				id: graph.id,
				file: "descriptor.json"
			}, {
				id: graph.id,
				file: `graph.${first.revision}.json`
			});
		}
		return out;
	}
	async function GET({ params, url }) {
		const graph = registered.get(params.id);
		const at = url.pathname.indexOf(SEGMENT);
		if (!graph || at < 0) return notFound();
		const base = url.pathname.slice(0, at);
		let result;
		try {
			result = await evaluated(params.id);
		} catch (e) {
			return new Response(e instanceof Error ? e.message : String(e), {
				status: 500,
				headers: { "content-type": "text/plain; charset=utf-8" }
			});
		}
		if (params.file === "descriptor.json") return json(JSON.stringify(descriptorOf(graph.id, result, graph.indexes, base, `${SEGMENT}${graph.id}/graph.${result.revision}.json`)));
		if (params.file === `graph.${result.revision}.json`) return json(result.text.replace(/\n$/, ""));
		return notFound();
	}
	return {
		GET,
		entries
	};
}
// src/routes/relate/[id]/[file]/+server.ts
var prerender = true;
var { GET, entries } = createGraphRoute(graphs);
export { GET, entries, prerender };

//# sourceMappingURL=_server.ts.js.map