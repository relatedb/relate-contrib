import "../../../chunks/server2.js";
import { t as RelPage } from "../../../chunks/RelPage.js";
// src/routes/broken.html/+page.svelte
function _page($$renderer) {
	RelPage($$renderer, {
		title: "Example site: broken graph",
		variant: "broken",
		children: ($$renderer) => {
			$$renderer.push(`<p>Runs with a descriptor whose data cannot be fetched (variant broken).</p>`);
		},
		$$slots: { default: true }
	});
}
export { _page as default };

//# sourceMappingURL=_page.svelte.js.map