// Tagged-template client in the style of Observable's database clients:
//
//   const rows = await cypher`MATCH (p:Person) WHERE p.age >= ${minAge} RETURN p.name AS name`;
//
// Each ${} becomes a parameter ($p0, $p1, ...), so values are never spliced
// into the query text. The tag returns an array of row objects keyed in column
// order, with `columns`, `columnTypes`, `stats` and `elapsedMs` attached, so
// Inputs.table, Plot and d3 can consume it directly. Entities in a row are
// flattened ({id, labels, ...properties} / {id, type, start, end, ...properties})
// so accessors like d => d.p.age work. The normalized result, with the original
// tagged entities, is on the non-enumerable `result` property for toGraph().
// Engine errors reject, as they do for Observable's other clients.
//
// `run(text, params)` executes one statement and resolves to a normalized
// result (see normalize.js); it is injected so the tag runs in Node as well.
export function makeCypher(run) {
  return async function cypher(strings, ...values) {
    const text = strings.reduce((acc, s, i) => acc + s + (i < values.length ? `$p${i}` : ""), "");
    const params = values.length ? Object.fromEntries(values.map((v, i) => [`p${i}`, v])) : null;
    const result = await run(text, params);
    if (result.error) throw new Error(result.error);
    const rows = result.tableRows;
    rows.columns = result.columns;
    rows.columnTypes = result.columnTypes;
    rows.stats = result.stats;
    rows.elapsedMs = result.elapsedMs;
    Object.defineProperty(rows, "result", {value: result});
    return rows;
  };
}
