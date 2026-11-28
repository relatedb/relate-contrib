// covers-rel: FR-023, FR-024, SC-007
// The engine behaviours the core relies on (ADR-013 2.5), run against the real engine in Node. Each title names a behaviour, so that
// when an engine release changes one, the failing test says which. The origin-private store needs a browser, so its behaviour is
// pinned by the application-graph browser tests, which the engine-release lane runs. The trap test is last: a trapped
// WebAssembly instance is unusable, and so is the module this file loaded.
import { existsSync, readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { beforeAll, describe, expect, it } from "vitest";

type Db = { execute(statement: string, paramsJson?: string | null): string };
type Wasm = { default: (o: { module_or_path: Uint8Array }) => Promise<unknown>; RelateDb: new () => Db };
type Envelope = { columns: string[]; rows: Record<string, unknown>[]; stats: Record<string, number>; error: string | null; elapsed_ms?: number };

let wasm: Wasm;
let isWasmTrap: (e: unknown) => boolean;

beforeAll(async () => {
  const dir = dirname(createRequire(import.meta.url).resolve("@relate/relate-wasm"));
  wasm = (await import(join(dir, "relate.js"))) as Wasm;
  await wasm.default({ module_or_path: readFileSync(join(dir, "relate_bg.wasm")) });
  isWasmTrap = ((await import(join(dir, "trap.js"))) as { isWasmTrap: (e: unknown) => boolean }).isWasmTrap;
});

const run = (db: Db, statement: string, params?: Record<string, unknown>): Envelope => JSON.parse(db.execute(statement, params ? JSON.stringify(params) : null)) as Envelope;

describe("the engine behaviours the core relies on", () => {
  it("returns a result envelope with columns, rows as objects, stats and an error that is null on success", () => {
    const r = run(new wasm.RelateDb(), "RETURN 1 AS x, 'a' AS y");
    expect(r.error).toBeNull();
    expect(r.columns).toEqual(["x", "y"]);
    expect(r.rows).toEqual([{ x: 1, y: "a" }]);
    expect(typeof r.stats).toBe("object");
    expect(typeof r.elapsed_ms).toBe("number");
  });

  it("delivers an engine error in the envelope's error and does not throw", () => {
    const db = new wasm.RelateDb();
    let r: Envelope | undefined;
    expect(() => (r = run(db, "THIS IS NOT CYPHER"))).not.toThrow();
    expect(r!.error).toMatch(/syntax error/i);
    expect(r!.rows).toEqual([]);
  });

  it("binds parameters passed as JSON", () => {
    const r = run(new wasm.RelateDb(), "RETURN $v AS v, $s AS s", { v: 7, s: "text" });
    expect(r.rows).toEqual([{ v: 7, s: "text" }]);
  });

  it("creates a uniqueness constraint idempotently, and refuses a duplicate through the envelope's error", () => {
    const db = new wasm.RelateDb();
    expect(run(db, "CREATE CONSTRAINT c1 IF NOT EXISTS FOR (n:T) REQUIRE n.id IS UNIQUE").error).toBeNull();
    expect(run(db, "CREATE CONSTRAINT c1 IF NOT EXISTS FOR (n:T) REQUIRE n.id IS UNIQUE").error).toBeNull();
    expect(run(db, "CREATE (:T {id: 'a'})").error).toBeNull();
    expect(run(db, "CREATE (:T {id: 'a'})").error).toMatch(/ConstraintValidationFailed/);
  });

  it("keeps separate in-memory instances apart", () => {
    const a = new wasm.RelateDb();
    const b = new wasm.RelateDb();
    run(a, "CREATE (:Only {id: 1})");
    expect(run(b, "MATCH (n:Only) RETURN count(n) AS n").rows).toEqual([{ n: 0 }]);
  });

  it("names its version in a Relate row of CALL dbms.components(), which is how the client says which engine runs it", () => {
    const r = run(new wasm.RelateDb(), "CALL dbms.components() YIELD name, versions RETURN name, versions");
    expect(r.error).toBeNull();
    const row = r.rows.find((x) => x.name === "Relate") as { versions: string[] } | undefined;
    expect(row, "no row named Relate").toBeDefined();
    expect(row!.versions[0]).toMatch(/^\d+\.\d+\.\d+/);
  });

  it("moves a stats counter for each kind of change the client counts as a write, and none for a read", () => {
    const db = new wasm.RelateDb();
    const moved = (statement: string): string[] =>
      Object.entries(run(db, statement).stats)
        .filter(([, v]) => typeof v === "number" && v !== 0)
        .map(([k]) => k);
    // the statement that makes each kind of change, in an order that leaves something for the next to change
    const changes: Array<[string, string]> = [
      ["CREATE (:A {x: 1})-[:R]->(:A {x: 2})", "nodes_created"],
      ["MATCH (n:A {x: 1}) SET n.y = 5", "properties_set"],
      ["MATCH (n:A {x: 1}) SET n:B", "labels_added"],
      ["MATCH (n:A {x: 1}) REMOVE n:B", "labels_removed"],
      ["MATCH (a:A {x: 1}), (b:A {x: 2}) CREATE (a)-[:S]->(b)", "relationships_created"],
      ["MATCH ()-[r:S]->() DELETE r", "relationships_deleted"],
      ["CREATE INDEX obs_idx IF NOT EXISTS FOR (n:A) ON (n.x)", "indexes_added"],
      ["DROP INDEX obs_idx", "indexes_removed"],
      ["CREATE CONSTRAINT obs_c IF NOT EXISTS FOR (n:A) REQUIRE n.x IS UNIQUE", "constraints_added"],
      ["MATCH (n:A) DETACH DELETE n", "nodes_deleted"],
    ];
    for (const [statement, counter] of changes) expect(moved(statement), `${statement} moved no ${counter}`).toContain(counter);
    expect(moved("MATCH (n) RETURN count(n) AS c")).toEqual([]);
  });

  it("pins the origin-private store's behaviour in the application-graph browser tests", () => {
    // OPFS stores need a dedicated worker in a browser, so they are checked by the browser suite (pnpm test:application-browsers), which
    // the engine-release lane runs. This title names that dependence; the file must exist for it to hold.
    expect(existsSync(join(import.meta.dirname, "../application/browser/durability.spec.ts"))).toBe(true);
  });

  // last: it traps the module. Since engine 1.2 a deeply nested statement is a syntax error ("maximum nesting depth of 500"),
  // not a trap; a long flat chain of additions still exhausts the stack.
  it("traps on a statement of a very long chain of additions, recognises the trap, and the instance is unusable afterwards", () => {
    const db = new wasm.RelateDb();
    const deep = `RETURN ${"1+".repeat(200000)}1`;
    let first: unknown;
    try {
      db.execute(deep, null);
    } catch (e) {
      first = e;
    }
    expect(first, "the statement did not trap").toBeDefined();
    expect(isWasmTrap(first)).toBe(true);
    let second: unknown;
    try {
      db.execute("RETURN 1", null);
    } catch (e) {
      second = e;
    }
    // an overflowing JavaScript stack leaves the instance borrowed, so the next call throws "recursive use of an object":
    // not classified as a trap by isWasmTrap, which is why the core marks an engine dead on the first trap and never calls it again
    expect(second, "the instance still answered after a trap").toBeDefined();
  });
});
