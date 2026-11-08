import "../../../chunks/server2.js";
import { t as LifetimeProbe } from "../../../chunks/LifetimeProbe.js";
import { t as RelPage } from "../../../chunks/RelPage.js";
// src/routes/lifetime-c.html/+page.svelte
function _page($$renderer) {
	RelPage($$renderer, {
		title: "Example site: lifetime C",
		bare: true,
		children: ($$renderer) => {
			LifetimeProbe($$renderer, {
				name: "other",
				label: "Page",
				title: "lifetime C"
			});
		},
		$$slots: { default: true }
	});
}
export { _page as default };

//# sourceMappingURL=_page.svelte.js.map