import "../../../chunks/server2.js";
import { t as LifetimeProbe } from "../../../chunks/LifetimeProbe.js";
import { t as RelPage } from "../../../chunks/RelPage.js";
// src/routes/lifetime-a.html/+page.svelte
function _page($$renderer) {
	RelPage($$renderer, {
		title: "Example site: lifetime A",
		bare: true,
		children: ($$renderer) => {
			LifetimeProbe($$renderer, {
				name: "small",
				title: "lifetime A"
			});
			$$renderer.push(`<!----> `);
			LifetimeProbe($$renderer, {
				name: "small",
				title: "lifetime A (second holder)"
			});
			$$renderer.push(`<!---->`);
		},
		$$slots: { default: true }
	});
}
export { _page as default };

//# sourceMappingURL=_page.svelte.js.map