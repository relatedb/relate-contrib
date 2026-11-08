import { l as escape_html } from "./server2.js";
import { i as useQuery, r as useGraph } from "./RelPage.js";
// src/lib/InlineCount.svelte
function InlineCount($$renderer, $$props) {
	$$renderer.component(($$renderer) => {
		let { name, label = "Item" } = $$props;
		useGraph(name);
		const count = useQuery(name, () => `MATCH (n:${label}) RETURN count(n) AS c`);
		const note = useQuery(name, () => `MATCH (n:${label}) WHERE n.note IS NOT NULL RETURN n.note AS note LIMIT 1`);
		$$renderer.push(`<p>Graph <span data-inline-name="">${escape_html(name)}</span>: status <span data-inline-status="">${escape_html(count.status)}</span> · nodes <span data-inline-count="">${escape_html(count.rows ? count.rows[0]?.c : "…")}</span> · note <span data-inline-note="">${escape_html(note.rows?.[0]?.note ?? "")}</span> · generation <span data-inline-generation="">${escape_html(count.generation)}</span></p>`);
	});
}
export { InlineCount as t };

//# sourceMappingURL=InlineCount.js.map