# Example site: documents

A page that opens graphs that need no descriptor: one from an object a cell holds, one from a data file a loader published.

```js
import {open} from "@relate/contrib-observable";
import {engine, smallFile, worker} from "./lib/files.js";
import {small} from "./lib/example.js";
const held = await open({engine, worker, graph: {document: small()}, invalidation});
const filed = await open({engine, worker, graph: {document: smallFile}, invalidation});
window.__document = {held, filed};
```

```js
await held.ready;
const [{c}] = await held.cypher`MATCH (n:Item) RETURN count(n) AS c`;
display(html`<p>From an object: <span id="from-object">${c}</span> items, status <span id="status-object">${held.client.status}</span></p>`);
```

```js
await filed.ready;
const [{c}] = await filed.cypher`MATCH (n:Item) RETURN count(n) AS c`;
const rows = await filed.cypher`MATCH (n:Item)-[:NEXT]->(m:Item) WHERE n.n = ${3} RETURN n.n AS from, m.n AS to`;
display(html`<p>From a data file: <span id="from-file">${c}</span> items, <span id="next-of-3">${rows[0].to}</span> follows 3, status <span id="status-file">${filed.client.status}</span></p>`);
```

```js
display(html`<p>This text and these links are plain markup: <a data-rel-link href="/index.html">Home</a></p>`);
```
