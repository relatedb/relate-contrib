# CypherLite in Observable Framework

An in-memory CypherLite database running in this page as WebAssembly. Pick a sample or edit the Cypher.

```js
import {openDb, query, runScript} from "./components/graphDbClient.js";
import {toGraph} from "./components/normalize.js";
import {forceGraph} from "./components/forceGraph.js";
import {seedScript, sampleQueries} from "./components/seed.js";

const {timings} = await openDb();
const seeded = await runScript(seedScript);
```

```js
const sample = view(Inputs.select(sampleQueries, {label: "Sample", format: (d) => d.label}));
```

```js
const cypher = view(Inputs.textarea({label: "Cypher", value: sample.query, rows: 3, width: 720, submit: "Run"}));
```

```js
const result = await query(cypher);
```

```js
if (result.error) {
  display(html`<pre style="color: #b00020">${result.error}</pre>`);
} else {
  display(html`<p>${result.rows.length} row(s) in ${result.elapsedMs} ms (engine-reported)</p>`);
}
```

```js
display(Inputs.table(result.tableRows, {columns: result.columns, required: false}));
```

```js
const chart = forceGraph(toGraph(result));
invalidation.then(() => chart.stop());
display(chart);
```

### Load timings

```js
display(html`<pre id="timings">${JSON.stringify({...timings, seedErrors: seeded.map((e) => e.error)}, null, 2)}</pre>`);
```

[Other components consuming the results](./components-demo) · [Raw wire envelopes](./probe)
