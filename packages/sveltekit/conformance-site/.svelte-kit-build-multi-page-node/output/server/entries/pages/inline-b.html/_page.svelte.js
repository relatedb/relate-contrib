import "../../../chunks/server2.js";
import { t as GraphData } from "../../../chunks/GraphData.js";
import { t as InlineCount } from "../../../chunks/InlineCount.js";
import { t as RelPage } from "../../../chunks/RelPage.js";
// src/routes/inline-b.html/+page.svelte
function _page($$renderer) {
	const document = {
		version: 1,
		nodes: [
			{
				id: "x",
				labels: ["Item"],
				properties: { note: "<\/script><b>x</b> & <!-- y" }
			},
			{
				id: "y",
				labels: ["Item"]
			},
			{
				id: "z",
				labels: ["Item"]
			}
		],
		links: []
	};
	RelPage($$renderer, {
		title: "Example site: inline B",
		bare: true,
		children: ($$renderer) => {
			GraphData($$renderer, {
				id: "g",
				document,
				page: "/inline-b.html"
			});
			$$renderer.push(`<!----> `);
			InlineCount($$renderer, { name: "g" });
			$$renderer.push(`<!---->`);
		},
		$$slots: { default: true }
	});
}
export { _page as default };

//# sourceMappingURL=_page.svelte.js.map