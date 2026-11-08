// ../../web/dist/data/validate.js
var Problem = class extends Error {
	path;
	constructor(path, message) {
		super(message);
		this.name = "Problem";
		this.path = path;
	}
};
var isObject = (v) => typeof v === "object" && v !== null && !Array.isArray(v);
var isNonEmptyString = (v) => typeof v === "string" && v !== "";
var finite = (v) => typeof v === "number" && Number.isFinite(v);
/** A property value is "string, finite number, boolean, or a non-empty array of one of those kinds". */
function checkPropertyValue(value, path) {
	if (typeof value === "string" || typeof value === "boolean" || finite(value)) return;
	if (Array.isArray(value)) {
		if (value.length === 0) throw new Problem(path, "an empty array is not a value; leave the property out");
		if (value.every((v) => typeof v === "string")) return;
		if (value.every(finite)) return;
		if (value.every((v) => typeof v === "boolean")) return;
		throw new Problem(path, "an array must hold only strings, only finite numbers or only booleans");
	}
	throw new Problem(path, "a property value must be a string, a finite number, a boolean or a non-empty array of one kind");
}
function checkProperties(value, path, options) {
	if (!isObject(value)) throw new Problem(path, "properties must be an object");
	for (const [key, v] of Object.entries(value)) {
		const keyPath = `${path}.${key}`;
		if (options.reserved.includes(key)) throw new Problem(keyPath, `"${key}" is reserved and cannot be a property`);
		checkPropertyValue(v, keyPath);
	}
}
function checkNode(node, path, ids, scoped) {
	if (!isObject(node)) throw new Problem(path, "a node must be an object");
	for (const key of Object.keys(node)) if (key !== "id" && key !== "labels" && key !== "properties") throw new Problem(`${path}.${key}`, `unknown key "${key}"`);
	if (!isNonEmptyString(node.id)) throw new Problem(`${path}.id`, "a node id must be a non-empty string");
	if (ids.has(node.id)) throw new Problem(`${path}.id`, `duplicate node id "${node.id}"`);
	ids.add(node.id);
	if ("labels" in node) {
		if (!Array.isArray(node.labels)) throw new Problem(`${path}.labels`, "labels must be an array");
		const seen = /* @__PURE__ */ new Set();
		node.labels.forEach((label, j) => {
			if (!isNonEmptyString(label)) throw new Problem(`${path}.labels[${j}]`, "a label must be a non-empty string");
			if (seen.has(label)) throw new Problem(`${path}.labels[${j}]`, `duplicate label "${label}"`);
			seen.add(label);
		});
	}
	if ("properties" in node) checkProperties(node.properties, `${path}.properties`, { reserved: scoped ? ["id", "scope"] : ["id"] });
}
function checkLink(link, path, ids) {
	if (!isObject(link)) throw new Problem(path, "a link must be an object");
	for (const key of Object.keys(link)) if (![
		"source",
		"target",
		"type",
		"properties"
	].includes(key)) throw new Problem(`${path}.${key}`, `unknown key "${key}"`);
	for (const end of ["source", "target"]) {
		const id = link[end];
		if (!isNonEmptyString(id)) throw new Problem(`${path}.${end}`, `a link ${end} must be a node id`);
		if (!ids.has(id)) throw new Problem(`${path}.${end}`, `the ${end} "${id}" names no node in the document`);
	}
	if (!isNonEmptyString(link.type)) throw new Problem(`${path}.type`, "a link type must be a non-empty string");
	if ("properties" in link) checkProperties(link.properties, `${path}.properties`, { reserved: [] });
}
/**
* Check a graph data document. Reports the path of the first problem, for example `nodes[3].properties.id`.
* With `scoped: true` a `scope` property on a node is also an error (a scoped load adds it itself).
*/
function validate(input, opts = {}) {
	try {
		if (!isObject(input)) throw new Problem("", "a graph data document must be an object");
		for (const key of Object.keys(input)) if (![
			"version",
			"revision",
			"nodes",
			"links"
		].includes(key)) throw new Problem(key, `unknown key "${key}"`);
		if (input.version !== 1) throw new Problem("version", input.version === void 0 ? "version is required" : `unknown format version ${String(input.version)}`);
		if ("revision" in input && !isNonEmptyString(input.revision)) throw new Problem("revision", "revision must be a non-empty string");
		if (!Array.isArray(input.nodes)) throw new Problem("nodes", "nodes must be an array");
		if (!Array.isArray(input.links)) throw new Problem("links", "links must be an array");
		const ids = /* @__PURE__ */ new Set();
		input.nodes.forEach((n, i) => checkNode(n, `nodes[${i}]`, ids, opts.scoped === true));
		input.links.forEach((l, i) => checkLink(l, `links[${i}]`, ids));
		return {
			ok: true,
			document: input
		};
	} catch (e) {
		if (e instanceof Problem) return {
			ok: false,
			path: e.path,
			message: e.message
		};
		throw e;
	}
}
// ../../web/dist/config.js
/** Timeout applied to a visitor-supplied statement when none is given. */
var VISITOR_TIMEOUT_MS = 1e4;
/** The descriptor `id`: 1 to 48 characters from A-Z a-z 0-9 _ - (so the store name stays within 64). */
var ID_PATTERN = /^[A-Za-z0-9_-]{1,48}$/;
// ../../web/dist/data/descriptor.js
var isCount = (v) => typeof v === "number" && Number.isInteger(v) && v >= 0;
/** Check a descriptor. Reports the path of the first problem, for example `data.nodes`. */
function validateDescriptor(input) {
	try {
		if (!isObject(input)) throw new Problem("", "a descriptor must be an object");
		for (const key of Object.keys(input)) {
			if (key === "shape" || key === "embeddings") throw new Problem(key, `"${key}" is reserved and not defined in version 1`);
			if (![
				"version",
				"id",
				"revision",
				"data",
				"indexes"
			].includes(key)) throw new Problem(key, `unknown key "${key}"`);
		}
		if (input.version !== 1) throw new Problem("version", input.version === void 0 ? "version is required" : `unknown descriptor version ${String(input.version)}`);
		if (typeof input.id !== "string" || !ID_PATTERN.test(input.id)) throw new Problem("id", "id must be 1 to 48 characters from A-Z a-z 0-9 _ -");
		if (!isNonEmptyString(input.revision)) throw new Problem("revision", "revision must be a non-empty string");
		const data = input.data;
		if (!isObject(data)) throw new Problem("data", "data must be an object");
		for (const key of Object.keys(data)) if (![
			"url",
			"nodes",
			"links"
		].includes(key)) throw new Problem(`data.${key}`, `unknown key "${key}"`);
		if (!isNonEmptyString(data.url)) throw new Problem("data.url", "data.url must be a non-empty string");
		if (!isCount(data.nodes)) throw new Problem("data.nodes", "data.nodes must be a non-negative integer");
		if (!isCount(data.links)) throw new Problem("data.links", "data.links must be a non-negative integer");
		if ("indexes" in input) {
			if (!Array.isArray(input.indexes)) throw new Problem("indexes", "indexes must be an array");
			input.indexes.forEach((spec, i) => {
				const path = `indexes[${i}]`;
				if (!isObject(spec)) throw new Problem(path, "an index must be an object");
				for (const key of Object.keys(spec)) if (key !== "label" && key !== "property") throw new Problem(`${path}.${key}`, `unknown key "${key}"`);
				if (!isNonEmptyString(spec.label)) throw new Problem(`${path}.label`, "label must be a non-empty string");
				if (!isNonEmptyString(spec.property)) throw new Problem(`${path}.property`, "property must be a non-empty string");
			});
		}
		return {
			ok: true,
			descriptor: input
		};
	} catch (e) {
		if (e instanceof Problem) return {
			ok: false,
			path: e.path,
			message: e.message
		};
		throw e;
	}
}
export { VISITOR_TIMEOUT_MS as n, validate as r, validateDescriptor as t };

//# sourceMappingURL=descriptor.js.map