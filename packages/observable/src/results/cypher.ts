import type { NormalizedResult, Rows } from "./types.js";

export type Query = (text: string, params: Record<string, unknown> | null) => Promise<NormalizedResult>;
export type Cypher = (strings: TemplateStringsArray, ...values: unknown[]) => Promise<Rows>;

/**
 * A tagged template over `query`, in the style of Observable's database clients:
 *
 *   const rows = await cypher`MATCH (p:Person) WHERE p.age >= ${minAge} RETURN p.name AS name`;
 *
 * Each `${}` becomes a parameter (`$p0`, `$p1`, ...), so a value is never spliced into the statement text. The call resolves to an
 * array of flattened rows with `columns`, `columnTypes`, `stats` and `elapsedMs` attached and the normalized result, with the
 * engine's original entities, on the non-enumerable `result`. It rejects when the engine returns an error.
 */
export function makeCypher(query: Query): Cypher {
  return async function cypher(strings, ...values) {
    const text = strings.reduce((acc, s, i) => acc + s + (i < values.length ? `$p${i}` : ""), "");
    const params = values.length ? Object.fromEntries(values.map((v, i) => [`p${i}`, v])) : null;
    const result = await query(text, params);
    if (result.error) throw new Error(result.error);
    const rows = result.tableRows as Rows;
    rows.columns = result.columns;
    rows.columnTypes = result.columnTypes;
    rows.stats = result.stats;
    rows.elapsedMs = result.elapsedMs;
    Object.defineProperty(rows, "result", { value: result });
    return rows;
  };
}
