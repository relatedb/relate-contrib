---
title: "Example site: page 2"
---

<h1 data-rel-title>Example site: page 2</h1>

<div data-rel-page  hidden></div>

A page that queries the shared graph.

<section>
<p>Status: <span data-rel-status>loading</span> · generation <span data-rel-generation>0</span> · profile <span data-rel-profile></span> · instance <span data-rel-instance></span> · restored <span data-rel-restored>unknown</span></p>
<p>Pages in the graph: <span data-rel-count>…</span> · updates <span data-rel-updates>0</span> · last error <span data-rel-last-error></span></p>
<p data-rel-failure></p>
<p data-rel-notes-row hidden>Notes: <span data-rel-notes>…</span></p>
<p><button type="button" data-rel-action="trap">Run a statement that crashes the engine</button> <button type="button" data-rel-action="timeout">Run a statement that never ends (0.4 s timeout)</button></p>
</section>

```js
import {startRelPage} from "./lib/rel-page.js";
await startRelPage(invalidation);
```
