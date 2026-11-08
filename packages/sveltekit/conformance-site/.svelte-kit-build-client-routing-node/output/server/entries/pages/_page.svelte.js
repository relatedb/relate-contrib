import "../../chunks/server2.js";
import { t as RelPage } from "../../chunks/RelPage.js";
// src/routes/+page.svelte
function _page($$renderer) {
	RelPage($$renderer, {
		title: "Example site: home",
		children: ($$renderer) => {
			$$renderer.push(`<p>A page that queries the shared graph.</p>`);
		},
		$$slots: { default: true }
	});
}
export { _page as default };

//# sourceMappingURL=_page.svelte.js.map