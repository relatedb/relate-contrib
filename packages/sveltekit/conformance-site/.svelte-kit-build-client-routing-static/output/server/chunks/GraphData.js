import { i as html, t as derived } from "./server2.js";
import { r as validate, t as validateDescriptor } from "./descriptor.js";
import { t as getConfig } from "./context.js";
// ../../web/dist/build/inline.js
var fail = (owner, page, id, detail) => {
	throw new Error(`${owner}: ${page}: inline graph "${id}": ${detail}`);
};
/** JSON that is safe inside a <script> element: nothing in it can close the element or open a comment. */
function escapeJson(value) {
	return JSON.stringify(value).replaceAll("<", "\\u003c").replaceAll(">", "\\u003e").replaceAll("&", "\\u0026").replaceAll("\u2028", "\\u2028").replaceAll("\u2029", "\\u2029");
}
/**
* Validate an inline graph. `seen` holds the names already used on this page; `registered` the registered names.
* Throws an error that names the owner, the page, the graph and the first problem.
*/
function checkInline(owner, page, id, document, config, seen, registered) {
	const probeBase = {
		version: 1,
		id,
		revision: "0",
		data: {
			url: "/x",
			nodes: 0,
			links: 0
		}
	};
	const name = validateDescriptor(probeBase);
	if (!name.ok) fail(owner, page, String(id), `${name.path}: ${name.message}`);
	if (seen.has(id)) fail(owner, page, id, "the name is used twice on this page");
	if (registered.includes(id)) fail(owner, page, id, "the name is also a registered graph; use one or the other");
	const result = validate(document);
	if (!result.ok) fail(owner, page, id, `${result.path ? `${result.path}: ` : ""}${result.message}`);
	const settings = config ?? {};
	for (const key of Object.keys(settings)) if (key !== "indexes") fail(owner, page, id, `config.${key}: unknown setting`);
	if (settings.indexes !== void 0) {
		const probe = validateDescriptor({
			...probeBase,
			indexes: settings.indexes
		});
		if (!probe.ok) fail(owner, page, id, `config.${probe.path}: ${probe.message}`);
	}
	seen.add(id);
	return {
		document: result.document,
		config: settings
	};
}
// ../src/GraphData.svelte
function GraphData($$renderer, $$props) {
	$$renderer.component(($$renderer) => {
		/** @type {{ id: string, document: unknown, config?: import("@relate/web/build").InlineConfig, page: string }} */
		let { id, document, config: settings, page } = $$props;
		const context = getConfig();
		const text = derived(() => {
			if (typeof page !== "string" || page === "") throw new Error(`@relate/sveltekit: inline graph "${String(id)}": GraphData needs a page prop, the page's path, to name the page in its error messages`);
			if (!context) throw new Error(`@relate/sveltekit: ${page}: inline graph "${String(id)}": GraphData was used outside RelateProvider`);
			const seen = typeof window === "undefined" ? context.renderIds : /* @__PURE__ */ new Set();
			return escapeJson(checkInline("@relate/sveltekit", page, id, document, settings, seen, context.catalog.map((g) => g.id)));
		});
		$$renderer.push(`${html(`<script type="application/json" data-relate-graph="${id}">${text()}<\/script>`)}`);
	});
}
export { GraphData as t };

//# sourceMappingURL=GraphData.js.map