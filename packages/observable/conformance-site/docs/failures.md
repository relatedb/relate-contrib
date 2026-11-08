# Example site: graphs that fail

Two graphs that cannot load, and text beside them that must not depend on them.

```js
import {open} from "@relate/observable";
import {engine, worker} from "./lib/files.js";
const nowhere = {url: async () => "/missing-worker.js", json: async () => null};
const invalid = await open({engine, worker, graph: {document: {version: 1, nodes: [{labels: ["Item"]}], links: []}}, invalidation});
const unreachable = await open({engine, worker: nowhere, graph: {document: {version: 1, nodes: [], links: []}}, invalidation});
window.__failures = {invalid, unreachable};
```

```js
const message = await invalid.ready.then(() => "ready", (e) => e.message);
display(html`<p>Invalid document: status <span id="invalid-status">${invalid.client.status}</span>, reason <span id="invalid-reason">${invalid.client.diagnostic?.reason}</span>, message <span id="invalid-message">${message}</span></p>`);
```

```js
const message = await unreachable.ready.then(() => "ready", (e) => e.message);
display(html`<p>Unreachable worker: status <span id="unreachable-status">${unreachable.client.status}</span>, failures <span id="unreachable-failures">${unreachable.client.diagnostic?.failures}</span>, message <span id="unreachable-message">${message}</span></p>`);
```

```js
display(html`<p id="other-cell">This cell does not use either graph and renders at once. <a data-rel-link href="/index.html">Home</a></p>`);
```
