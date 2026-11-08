import "../../../chunks/server2.js";
import { t as GraphData } from "../../../chunks/GraphData.js";
import { t as InlineCount } from "../../../chunks/InlineCount.js";
import { t as RelPage } from "../../../chunks/RelPage.js";
import { n as small } from "../../../chunks/documents.js";
// src/routes/inline-a.html/+page.svelte
function _page($$renderer, $$props) {
	$$renderer.component(($$renderer) => {
		const document = small();
		RelPage($$renderer, {
			title: "Example site: inline A",
			bare: true,
			children: ($$renderer) => {
				GraphData($$renderer, {
					id: "g",
					document,
					config: { indexes: [{
						label: "Item",
						property: "id"
					}] },
					page: "/inline-a.html"
				});
				$$renderer.push(`<!----> `);
				InlineCount($$renderer, { name: "g" });
				$$renderer.push(`<!---->`);
			},
			$$slots: { default: true }
		});
	});
}
export { _page as default };

//# sourceMappingURL=_page.svelte.js.map