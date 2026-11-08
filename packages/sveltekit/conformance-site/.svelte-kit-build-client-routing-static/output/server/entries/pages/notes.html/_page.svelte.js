import "../../../chunks/server2.js";
import { t as RelPage } from "../../../chunks/RelPage.js";
// src/routes/notes.html/+page.svelte
function _page($$renderer) {
	RelPage($$renderer, {
		title: "Example site: notes",
		notesPage: true,
		children: ($$renderer) => {
			$$renderer.push(`<p>A page with its own data over the shared graph.</p>`);
		},
		$$slots: { default: true }
	});
}
export { _page as default };

//# sourceMappingURL=_page.svelte.js.map