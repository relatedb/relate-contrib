import { i as html, t as derived } from "./server2.js";
import { t as getConfig } from "./context.js";
import { checkInline, escapeJson } from "@relate/web/build";
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