# Contract: results entry (`@relate/observable/results`)

No browser or Node dependency; the browser entry re-exports it for the opened graph.

```ts
normalize(envelope): NormalizedResult
toGraph(result: NormalizedResult): { nodes, links }
makeCypher(query: (text, params) => Promise<NormalizedResult>): TaggedTemplate
```

- `normalize` (FR-018): the shape in [data-model.md](../data-model.md); rows reordered by `columns` (a no-op if the engine already orders them); an error envelope gives `error` set and empty `rows`.
- `toGraph` (FR-019): collects nodes and relationships from rows, including entities inside paths (alternating arrays, or `{ nodes, relationships }`), drops dangling relationships, empty for no entities.
- `makeCypher` (FR-020): interpolations become parameters `p0`, `p1`, … passed as the parameter object, never spliced; resolves to flattened rows with `columns`, `columnTypes`, `stats`, `elapsedMs` attached and the normalized result on a non-enumerable `result`; rejects with the engine's message on error.

The opened graph's `cypher` is `makeCypher` over `query`, and `query` calls the core client's `query` and normalizes the envelope (FR-021).
