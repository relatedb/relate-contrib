# t
```js
import {createClient} from "@relate/web";
const engineUrl = await FileAttachment("data/relate.wasm").url();
const workerUrl = await FileAttachment("data/relate-worker.js").url();
const doc = await FileAttachment("data/g.graph.json").json();
const client = createClient({engineUrl, graph: {document: doc}, navigation: "multi-page", workerFactory: () => new Worker(workerUrl, {type: "module"})});
invalidation.then(() => client.destroy());
const ready = new Promise((resolve, reject) => {
  const check = () => (client.status === "ready" ? resolve() : client.status === "failed" ? reject(new Error(client.failureMessage())) : false);
  client.on("status", check);
  check();
});
await ready;
const r = await client.query("MATCH (n:Item) RETURN count(n) AS c");
display(html`<p id="out">${client.status}:${JSON.stringify(r.rows)}</p>`);
```
