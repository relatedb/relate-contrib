// Measures what SC-009 states, as a single run on this machine, and records it in figures.json: how many statements a call
// costs, and what a list and a lookup by id cost with and without the uniqueness constraint's index. The engine runs in this
// process (Node), not in a browser worker, so the figures are not a claim about a page. Run: pnpm --filter @relate/react-admin measure
import { readFileSync, writeFileSync } from "node:fs";
import { arch, cpus, platform, release } from "node:os";
import { performance } from "node:perf_hooks";
import { fileURLToPath } from "node:url";
import { createDataProvider } from "../src/index.js";
import { schema } from "../tests/helpers/fixture.js";
import { testClient, type TestClient } from "../tests/helpers/in-process-client.js";

const out = fileURLToPath(new URL("../figures.json", import.meta.url));
const RUNS = 30;
const WARMUP = 5;

async function populate(client: TestClient, people: number): Promise<void> {
  for (const [id, name] of [["c1", "Acme"], ["c2", "Beta"], ["c3", "Gamma"]] as const) client.raw("CREATE (n:Company {id: $id, name: $name, founded: 2000})", { id, name });
  for (let c = 0; c < 3; c++) {
    const rows = [];
    for (let i = c; i < people; i += 3) rows.push({ props: { id: `p${String(i).padStart(5, "0")}`, name: `Person ${i}`, title: "engineer", age: 20 + (i % 40), active: i % 2 === 0 } });
    client.raw("MATCH (c:Company {id: $c}) UNWIND $rows AS row CREATE (p:Person) SET p += row.props CREATE (p)-[:WORKS_AT]->(c)", { c: `c${c + 1}`, rows });
  }
  client.reset();
}

const percentile = (sorted: number[], p: number) => sorted[Math.min(sorted.length - 1, Math.floor((p / 100) * sorted.length))]!;
async function time(label: string, fn: () => Promise<unknown>): Promise<{ label: string; medianMs: number; p95Ms: number; runs: number }> {
  for (let i = 0; i < WARMUP; i++) await fn();
  const samples: number[] = [];
  for (let i = 0; i < RUNS; i++) {
    const t = performance.now();
    await fn();
    samples.push(performance.now() - t);
  }
  samples.sort((a, b) => a - b);
  const round = (n: number) => Math.round(n * 1000) / 1000;
  return { label, medianMs: round(percentile(samples, 50)), p95Ms: round(percentile(samples, 95)), runs: RUNS };
}

const page = { page: 1, perPage: 10 };
const sort = { field: "name", order: "ASC" as const };

const sizes = [];
for (const people of [50, 5000]) {
  // with the constraint: the provider makes it before its first statement
  const client = await testClient();
  await populate(client, people);
  const provider = createDataProvider(client, schema);
  await provider.getList("people", { pagination: page, sort, filter: {} });
  const firstCall = client.statements().length; // the constraints, the page and the count
  client.reset();
  await provider.getList("people", { pagination: page, sort, filter: {} });
  const perList = client.statements().length;
  client.reset();
  await provider.getOne("people", { id: "p00001" });
  const perLookup = client.statements().length;
  client.reset();

  const target = `p${String(Math.floor(people / 2) + 1).padStart(5, "0")}`;
  const list = await time("getList, a page of 10 sorted by name", () => provider.getList("people", { pagination: page, sort, filter: {} }));
  const filtered = await time("getList, a page of 10 filtered by company and minimum age, sorted by name", () => provider.getList("people", { pagination: page, sort, filter: { company: "c2", age_gte: 30 } }));
  const lookup = await time("getOne by id, with the constraint and its index", () => provider.getOne("people", { id: target }));

  // the same data and the same getOne statement with no constraint, so no index on id
  const bare = await testClient();
  await populate(bare, people);
  const spy = await testClient();
  await populate(spy, people);
  const sameProvider = createDataProvider(spy, schema);
  await sameProvider.getOne("people", { id: target });
  const lookupCall = spy.calls.filter((c) => !c.statement.startsWith("CREATE CONSTRAINT")).at(-1)!;
  const unindexed = await time("getOne by id, the same statement with no constraint and no index", async () => bare.query(lookupCall.statement, lookupCall.params));

  sizes.push({ people, statements: { firstCall, perList, perLookup }, timings: [list, filtered, lookup, unindexed] });
  console.log(people, JSON.stringify(sizes.at(-1)!.statements), sizes.at(-1)!.timings.map((t) => `${t.label}: ${t.medianMs} ms`));
}

let figures: Record<string, unknown> = {};
try {
  figures = JSON.parse(readFileSync(out, "utf8"));
} catch {
  /* first run */
}
figures["SC-009"] = {
  claim: "once the constraints exist a list costs two statements and a lookup by id one; every resource's id carries a uniqueness constraint that owns the lookup index",
  label: "single run",
  method: `${RUNS} timed calls after ${WARMUP} warm-up calls per figure, through the provider over an in-process client; median and 95th percentile per call; the data are 3 companies and the given number of people, each person at one company`,
  environment: { node: process.version, os: `${platform()} ${release()} ${arch()}`, cpu: cpus()[0]?.model ?? "unknown", engine: "the vendored @relate/relate-wasm build, in this process (Node), not a browser worker" },
  measuredAt: new Date().toISOString().slice(0, 10),
  statementsNote: "firstCall = 3 constraints (one per resource) + the page + the count; later calls = the page + the count",
  results: sizes,
};
writeFileSync(out, JSON.stringify(figures, null, 2) + "\n");
console.log(`wrote ${out}`);
