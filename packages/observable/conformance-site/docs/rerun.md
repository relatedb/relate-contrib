# Example site: a cell that opens again

An input that one cell reads, and the cell that opens a graph reads it. Every move of the input runs that cell again, which must end the client it opened before. A second graph is opened in a cell that reads nothing, and must stay.

```js
const level = view(Inputs.range([0, 100], {value: 0, step: 1, label: "level"}));
```

```js
import {open} from "@relate/contrib-observable";
import {engine, smallFile, worker} from "./lib/files.js";
const stable = await open({engine, worker, graph: {document: smallFile}, invalidation});
window.__stable = stable;
```

```js
import {open as openAgain} from "@relate/contrib-observable";
import {engine as engineFile, smallFile as smallAgain, worker as workerFile} from "./lib/files.js";
level; // this cell runs again whenever the input moves
const dependent = await openAgain({engine: engineFile, worker: workerFile, graph: {document: smallAgain}, invalidation});
window.__dependent = dependent;
await dependent.ready;
display(html`<p>Opened at level <span id="level">${level}</span>, generation <span id="dependent-generation">${dependent.client.generation}</span></p>`);
```

```js
await stable.ready;
display(html`<p>The stable graph: status <span id="stable-status">${stable.client.status}</span>, generation <span id="stable-generation">${stable.client.generation}</span></p>`);
```
