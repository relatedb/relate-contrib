import { r as validate, t as validateDescriptor } from "./descriptor.js";
import { n as small, t as sized } from "./documents.js";
// ../../web/dist/build/canonical.js
var sortKeys = (value) => {
	if (Array.isArray(value)) return value.map(sortKeys);
	if (value !== null && typeof value === "object") return Object.fromEntries(Object.keys(value).sort().map((k) => [k, sortKeys(value[k])]));
	return value;
};
/** The document as text that does not depend on the order of keys, nodes or links; any `revision` it carries is dropped. */
function canonicalText(document) {
	const nodes = [...document.nodes].map((n) => sortKeys(n)).sort((a, b) => a.id < b.id ? -1 : a.id > b.id ? 1 : 0);
	const key = (l) => JSON.stringify([
		l.source,
		l.target,
		l.type,
		sortKeys(l.properties ?? {})
	]);
	const links = [...document.links].map((l) => sortKeys(l)).sort((a, b) => key(a) < key(b) ? -1 : key(a) > key(b) ? 1 : 0);
	return JSON.stringify({
		version: 1,
		nodes,
		links
	});
}
/** The first 12 hexadecimal digits of the SHA-256 of the canonical text. */
async function revisionOf(text) {
	const digest = await globalThis.crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
	let hex = "";
	for (const byte of new Uint8Array(digest).subarray(0, 6)) hex += byte.toString(16).padStart(2, "0");
	return hex;
}
// ../../web/dist/build/prepare.js
/** Validate and canonicalize a source's output. The error message names the graph and the path of the first problem. */
async function prepare(owner, name, raw) {
	const result = validate(raw);
	if (!result.ok) throw new Error(`${owner}: graph "${name}": ${result.path ? `${result.path}: ` : ""}${result.message}`);
	const text = canonicalText(result.document);
	return {
		text,
		revision: await revisionOf(text),
		nodes: result.document.nodes.length,
		links: result.document.links.length
	};
}
/** Call a source, then prepare its output. */
async function evaluate(owner, name, load) {
	let raw;
	try {
		raw = await load();
	} catch (e) {
		throw new Error(`${owner}: graph "${name}": the source failed: ${e instanceof Error ? e.message : String(e)}`);
	}
	return prepare(owner, name, raw);
}
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