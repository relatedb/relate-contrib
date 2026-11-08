import { n as small, t as sized } from "./documents.js";
import { evaluate } from "@relate/web/build";
import { validateDescriptor } from "@relate/web/validate";
// ../dist/server/graphs.js
var OWNER = "@relate/sveltekit";
var PROBE = {
	version: 1,
	revision: "0",
	data: {
		url: "/x",
		nodes: 0,
		links: 0
	}
};
/** Check the declarations and return them as a list. Throws, naming the problem, for a bad id, a duplicate or a bad field. */
function declare(graphs) {
	const entries = Array.isArray(graphs) ? graphs.map((g) => [g.id, g]) : Object.entries(graphs);
	const seen = /* @__PURE__ */ new Set();
	return entries.map(([id, g]) => {
		const name = validateDescriptor({
			...PROBE,
			id
		});
		if (!name.ok) throw new Error(`${OWNER}: graph "${id}": ${name.path}: ${name.message}`);
		if (seen.has(id)) throw new Error(`${OWNER}: graph "${id}": the id is declared twice`);
		seen.add(id);
		if (typeof g?.source !== "function") throw new Error(`${OWNER}: graph "${id}": the source must be a function that returns a document`);
		const lifetime = g.lifetime ?? "page";
		if (lifetime !== "page" && lifetime !== "visit") throw new Error(`${OWNER}: graph "${id}": lifetime "${String(lifetime)}" is not "page" or "visit"`);
		const indexes = g.indexes ?? [];
		if (indexes.length) {
			const probe = validateDescriptor({
				...PROBE,
				id,
				indexes
			});
			if (!probe.ok) throw new Error(`${OWNER}: graph "${id}": indexes.${probe.path}: ${probe.message}`);
		}
		return {
			id,
			source: g.source,
			indexes,
			lifetime
		};
	});
}
/** Call a source and prepare its output: validated, canonical, with its revision and counts. */
var evaluateSource = (registered) => evaluate(OWNER, registered.id, registered.source);
var isDevelopment = () => process.env.NODE_ENV === "development";
// src/lib/graphs.ts
var graphs = {
	example: {
		source: () => sized(300),
		lifetime: "visit",
		indexes: [{
			label: "Page",
			property: "id"
		}]
	},
	small: { source: small },
	other: { source: () => sized(10) }
};
export { isDevelopment as a, evaluateSource as i, OWNER as n, declare as r, graphs as t };

//# sourceMappingURL=graphs.js.map