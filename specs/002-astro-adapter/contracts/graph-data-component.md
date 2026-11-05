# Contract: the inline graph component (`@relate/web-astro/graph-data`)

```astro
---
import GraphData from "@relate/web-astro/graph-data";
---
<GraphData id="recipe" document={document} config={{ indexes: [{ label: "Step", property: "id" }] }} />
```

| Prop | Type | Rule |
|------|------|------|
| `id` | string | ADR-003 id rule; unique on the page; not a registered name |
| `document` | ADR-002 document | validated with the core's validator at build |
| `config` | `{ indexes?: Array<{label, property}> }` (optional) | validated at build; indexes are created by the core before the nodes; nothing else is created |

**Output**: one `<script type="application/json" data-relate-graph="<id>">` holding `{document, config}`, with `<`, `>`, `&`, U+2028 and U+2029 escaped. No request, descriptor, revision or stored copy.

**Build failures** (message names the page and the problem): an invalid document or `config` (path of the first problem), a duplicate `id` on the page, an `id` that is also registered.

Several components with different ids may appear on one page.
