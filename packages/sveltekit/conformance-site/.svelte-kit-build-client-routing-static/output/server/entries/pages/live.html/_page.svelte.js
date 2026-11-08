import "../../../chunks/server2.js";
import { t as RelPage } from "../../../chunks/RelPage.js";
// src/routes/live.html/+page.svelte
function _page($$renderer) {
	RelPage($$renderer, {
		title: "Example site: live",
		children: ($$renderer) => {
			$$renderer.push(`<p>A page rendered on demand when the output is a Node server.</p>`);
		},
		$$slots: { default: true }
	});
}
export { _page as default };

//# sourceMappingURL=_page.svelte.js.map