import { l as escape_html } from "../../../chunks/server2.js";
import { t as GraphData } from "../../../chunks/GraphData.js";
import { t as RelPage } from "../../../chunks/RelPage.js";
import "../../../chunks/index-server.js";
import { n as small } from "../../../chunks/documents.js";
// src/routes/direct.html/+page.svelte
function _page($$renderer, $$props) {
	$$renderer.component(($$renderer) => {
		const document = small();
		const results = {
			visit: "…",
			page: "…",
			inline: "…",
			unknown: "…",
			twice: "…"
		};
		RelPage($$renderer, {
			title: "Example site: direct",
			bare: true,
			children: ($$renderer) => {
				GraphData($$renderer, {
					id: "g",
					document,
					page: "/direct.html"
				});
				$$renderer.push(`<!----> <p>visit: <span data-direct-visit="">${escape_html(results.visit)}</span></p> <p>same client twice: <span data-direct-twice="">${escape_html(results.twice)}</span></p> <p>page lifetime: <span data-direct-page="">${escape_html(results.page)}</span></p> <p>inline: <span data-direct-inline="">${escape_html(results.inline)}</span></p> <p>unknown: <span data-direct-unknown="">${escape_html(results.unknown)}</span></p>`);
			},
			$$slots: { default: true }
		});
	});
}
export { _page as default };

//# sourceMappingURL=_page.svelte.js.map