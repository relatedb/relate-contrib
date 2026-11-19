# Example site: queries feeding components

Rows from the tagged template feed a chart, a table and a select. Values interpolated into the template are bound parameters.

```js
import {open} from "@relate/contrib-observable";
import {engine, variants, worker} from "./lib/files.js";
const db = await open({engine, worker, graph: variants.a, invalidation});
await db.ready;
```

```js
const sections = await db.cypher`MATCH (p:Page) RETURN p.section AS section, count(p) AS pages ORDER BY section`;
display(html`<p>Sections: <span id="section-count">${sections.length}</span>, pages in the first: <span id="first-section-pages">${sections[0].pages}</span></p>`);
const chart = Plot.plot({marks: [Plot.barY(sections, {x: "section", y: "pages", tip: true}), Plot.ruleY([0])]});
chart.id = "chart";
display(chart);
```

```js
const section = view(Inputs.select(sections.map((d) => d.section), {label: "section"}));
```

```js
const limit = view(Inputs.range([1, 10], {value: 5, step: 1, label: "limit"}));
```

```js
const rows = await db.cypher`MATCH (p:Page) WHERE p.section = ${section} RETURN p.title AS title, p.slug AS slug ORDER BY slug LIMIT ${limit}`;
display(html`<p>Rows for <span id="chosen-section">${section}</span>: <span id="row-count">${rows.length}</span>, columns <span id="row-columns">${rows.columns.join(",")}</span></p>`);
const table = Inputs.table(rows);
table.id = "table";
display(table);
```

```js
const term = view(Inputs.text({label: "title", placeholder: "title to find"}));
```

```js
const found = await db.cypher`MATCH (p:Page) WHERE p.title = ${term} RETURN p.title AS title`;
display(html`<p>Matches for <code id="term">${term}</code>: <span id="match-count">${found.length}</span></p>`);
```
