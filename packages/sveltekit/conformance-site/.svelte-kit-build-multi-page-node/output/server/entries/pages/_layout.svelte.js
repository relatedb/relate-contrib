import "../../chunks/server2.js";
import { r as setConfig } from "../../chunks/context.js";
import { n as goto } from "../../chunks/navigation.js";
// ../../../vendor/relate-wasm/pkg/relate_bg.wasm?url
var relate_bg_default = "/_app/immutable/assets/relate_bg.kL_VQXVI.wasm";
// ../src/RelateProvider.svelte
function RelateProvider($$renderer, $$props) {
	$$renderer.component(($$renderer) => {
		/** @type {{ catalog: import("./context.js").CatalogEntry[], engineUrl: string | URL, navigation?: "client-routing" | "multi-page", children?: import("svelte").Snippet }} */
		let { catalog, engineUrl, navigation = "client-routing", children } = $$props;
		setConfig({
			get catalog() {
				return catalog;
			},
			get engineUrl() {
				return engineUrl;
			},
			get profile() {
				return navigation;
			},
			renderIds: /* @__PURE__ */ new Set()
		});
		children?.($$renderer);
		$$renderer.push(`<!---->`);
	});
}
// src/routes/+layout.svelte
function _layout($$renderer, $$props) {
	$$renderer.component(($$renderer) => {
		let { data, children } = $$props;
		if (typeof window !== "undefined") window.__goto = goto;
		RelateProvider($$renderer, {
			catalog: data.catalog,
			engineUrl: relate_bg_default,
			navigation: "multi-page",
			children: ($$renderer) => {
				children($$renderer);
				$$renderer.push(`<!---->`);
			},
			$$slots: { default: true }
		});
	});
}
export { _layout as default };

//# sourceMappingURL=_layout.svelte.js.map