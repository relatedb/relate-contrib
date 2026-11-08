import { l as escape_html } from "../../../chunks/server2.js";
import { i as useQuery, t as RelPage } from "../../../chunks/RelPage.js";
// src/routes/switch.html/+page.svelte
function _page($$renderer, $$props) {
	$$renderer.component(($$renderer) => {
		let which = "small";
		const count = useQuery(() => which, "MATCH (n) RETURN count(n) AS c");
		RelPage($$renderer, {
			title: "Example site: switch",
			bare: true,
			children: ($$renderer) => {
				$$renderer.push(`<p>Graph <span data-switch-id="">${escape_html(which)}</span>: status <span data-switch-status="">${escape_html(count.status)}</span> · nodes <span data-switch-count="">${escape_html(count.rows ? count.rows[0]?.c : "…")}</span></p> <p><button type="button" data-switch-toggle="">Switch graph</button></p>`);
			},
			$$slots: { default: true }
		});
	});
}
export { _page as default };

//# sourceMappingURL=_page.svelte.js.map