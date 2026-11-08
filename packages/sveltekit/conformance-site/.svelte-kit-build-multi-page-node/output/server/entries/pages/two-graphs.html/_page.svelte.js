import "../../../chunks/server2.js";
import { t as GraphData } from "../../../chunks/GraphData.js";
import { t as InlineCount } from "../../../chunks/InlineCount.js";
import { t as RelPage } from "../../../chunks/RelPage.js";
import { n as small, t as sized } from "../../../chunks/documents.js";
// src/routes/two-graphs.html/+page.svelte
function _page($$renderer, $$props) {
	$$renderer.component(($$renderer) => {
		const first = small();
		const second = sized(5);
		`${"(".repeat(1e3)}${")".repeat(1e3)}`;
		RelPage($$renderer, {
			title: "Example site: two graphs",
			bare: true,
			children: ($$renderer) => {
				GraphData($$renderer, {
					id: "first",
					document: first,
					page: "/two-graphs.html"
				});
				$$renderer.push(`<!----> `);
				GraphData($$renderer, {
					id: "second",
					document: second,
					page: "/two-graphs.html"
				});
				$$renderer.push(`<!----> `);
				InlineCount($$renderer, { name: "first" });
				$$renderer.push(`<!----> `);
				InlineCount($$renderer, {
					name: "second",
					label: "Page"
				});
				$$renderer.push(`<!----> <p><button type="button" data-trap-first="">Crash the first graph's engine</button></p>`);
			},
			$$slots: { default: true }
		});
	});
}
export { _page as default };

//# sourceMappingURL=_page.svelte.js.map