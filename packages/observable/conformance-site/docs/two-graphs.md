# Example site: two graphs

Two independent graphs on one page, each with its own worker. A button crashes the first one's engine.

```js
import {open} from "@relate/contrib-observable";
import {engine, smallFile, variants, worker} from "./lib/files.js";
const one = await open({engine, worker, graph: {document: smallFile}, invalidation});
const two = await open({engine, worker, graph: variants.a, invalidation});
window.__two = {one, two};
```

```js
const show = (id, text) => (document.getElementById(id).textContent = text);
const watch = (name, db, label) => {
  const render = () => show(`${name}-generation`, String(db.client.generation));
  db.client.on("status", () => { show(`${name}-status`, db.client.status); render(); });
  db.client.subscribe(`MATCH (n:${label}) RETURN count(n) AS c`, null, (u) => { if (u.rows) show(`${name}-count`, String(u.rows[0].c)); render(); });
  render();
};
display(html`<section>
<p>One: status <span id="one-status">loading</span> · generation <span id="one-generation">0</span> · count <span id="one-count">…</span></p>
<p>Two: status <span id="two-status">loading</span> · generation <span id="two-generation">0</span> · count <span id="two-count">…</span></p>
<p><button type="button" id="trap-one">Crash the first engine</button></p>
</section>`);
watch("one", one, "Item");
watch("two", two, "Page");
document.getElementById("trap-one").onclick = () => one.client.query(`RETURN ${"(".repeat(1000)}1${")".repeat(1000)} AS x`).catch(() => undefined);
```
