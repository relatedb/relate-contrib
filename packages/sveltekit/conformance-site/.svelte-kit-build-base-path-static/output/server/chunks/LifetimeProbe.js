import { l as escape_html } from "./server2.js";
import { r as useGraph } from "./RelPage.js";
// src/lib/LifetimeProbe.svelte
function LifetimeProbe($$renderer, $$props) {
	$$renderer.component(($$renderer) => {
		let { name = "small", label = "Item", title } = $$props;
		const win = typeof window === "undefined" ? {} : window;
		win.__relLog ??= [];
		globalThis.__relIds ??= /* @__PURE__ */ new WeakMap();
		useGraph(name);
		$$renderer.push(`<p>Graph <span data-life-name="">${escape_html(name)}</span>: status <span data-life-status="">${escape_html("idle")}</span> · count <span data-life-count="">${escape_html("…")}</span> · restored <span data-life-restored="">${escape_html("unknown")}</span></p>`);
	});
}
export { LifetimeProbe as t };

//# sourceMappingURL=LifetimeProbe.js.map