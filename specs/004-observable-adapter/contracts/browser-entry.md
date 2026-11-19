# Contract: browser entry (`@relate/contrib-observable`)

Imported from a page's cells or a module the page imports. Starts nothing until `open` is called (FR-015).

```js
const db = await open({
  engine: FileAttachment("data/relate.wasm"),
  worker: FileAttachment("data/relate-worker.js"),
  graph: { descriptor: FileAttachment("data/pantry.descriptor.json"), data: FileAttachment("data/pantry.graph.json") },
  // or: graph: { document: FileAttachment("data/pantry.graph.json"), indexes },
  // or: graph: { document: objectTheCellHolds, indexes },
  invalidation,
});
await db.ready;
const rows = await db.cypher`MATCH (p:Page) WHERE p.words > ${min} RETURN p.title AS title`;
```

- Returns a promise of `{ client, ready, cypher, query, graph }`, resolved as soon as the attachments' locations are known and the client exists; the graph is not ready yet (FR-011). A location is available only through a promise, so the call cannot be synchronous.
- Resolves each attachment's published location once per page, by attachment object (research D-3), and for a descriptor input reads the descriptor and sets `data.url` to the data attachment's location (FR-012, FR-013).
- Creates the client with the core's `createClient`: `navigation: "multi-page"`, `engineUrl`, and `workerFactory: () => new Worker(workerUrl, { type: "module" })` (FR-014). Passes status, events and failure wording through unaltered.
- Destroys the client when `invalidation` resolves and on `pagehide`; on `pageshow` with `persisted` set, reloads the document once (FR-015, ADR-006 §2.3).
- Any number of calls on a page; each is an independent client with its own worker (FR-016).
- `ready` rejects with the core's failure wording when the client reaches `failed` (US1 scenarios 4 and 5).
- No `navigation` option, no visit-lifetime client, no main-thread instance (FR-017).
- Readiness for cells: `await db.ready` replaces a polling loop, which a cell cannot contain (research V-7).
