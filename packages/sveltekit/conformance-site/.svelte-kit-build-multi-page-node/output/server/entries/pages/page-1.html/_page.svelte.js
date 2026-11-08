import "../../../chunks/server2.js";
import { t as RelPage } from "../../../chunks/RelPage.js";
// src/routes/page-1.html/+page.svelte
function _page($$renderer) {
	RelPage($$renderer, {
		title: "Example site: page 1",
		children: ($$renderer) => {
			$$renderer.push(`<p>A page that queries the shared graph.</p>`);
		},
		$$slots: { default: true }
	});
}
export { _page as default };

//# sourceMappingURL=_page.svelte.js.map