// covers: FR-015, FR-016, FR-017, FR-018, FR-019, FR-039, SC-006
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { expect, test, type Page } from "./fixtures.js";

const fixtures = join(import.meta.dirname, "../fixtures/documents");
const doc = (name: string): unknown => JSON.parse(readFileSync(join(fixtures, "valid", name), "utf8"));

async function open(page: Page): Promise<void> {
  await page.goto("/engine.html");
  await page.waitForFunction(() => document.documentElement.dataset.ready === "1");
}
const rpc = <T = any>(page: Page, op: string, payload: Record<string, unknown> = {}): Promise<T> =>
  page.evaluate(([o, p]) => window.rpc(o as string, p as Record<string, unknown>), [op, payload] as const) as Promise<T>;
const rows = async (page: Page, statement: string, params?: unknown): Promise<any[]> => {
  const r = await rpc(page, "query", { statement, params });
  expect(r.ok, JSON.stringify(r)).toBe(true);
  return r.rows;
};

test.beforeEach(async ({ page }) => {
  await open(page);
});

test("loads nodes with their labels, properties and an id property, and links with their type and properties", async ({ page }) => {
  const r = await rpc(page, "load", { input: doc("basic.json") });
  expect(r).toMatchObject({ ok: true, result: { nodes: 2, links: 1 } });
  expect(await rows(page, "MATCH (n) RETURN n.id AS id, labels(n) AS l, n.title AS t, n.words AS w, n.draft AS d ORDER BY id")).toEqual([
    { id: "n1", l: ["Page"], t: "A", w: 812, d: false },
    { id: "n2", l: ["Page"], t: "B", w: null, d: null },
  ]);
  expect(await rows(page, "MATCH (a)-[r]->(b) RETURN a.id AS a, type(r) AS t, b.id AS b, r.section AS s")).toEqual([
    { a: "n1", t: "LINKS_TO", b: "n2", s: "next" },
  ]);
});

test("applies several labels, no labels, and any relationship type without changing the statements", async ({ page }) => {
  await rpc(page, "load", { input: doc("multi-label.json") });
  expect(await rows(page, "MATCH (n) RETURN n.id AS id, labels(n) AS l ORDER BY id")).toEqual([
    { id: "n1", l: ["Page", "Doc"] },
    { id: "n2", l: ["Other"] },
  ]);
  await rpc(page, "fresh");
  await rpc(page, "load", { input: doc("no-labels.json") });
  expect(await rows(page, "MATCH (n) RETURN n.id AS id, labels(n) AS l ORDER BY id")).toEqual([
    { id: "n1", l: [] },
    { id: "n2", l: [] },
  ]);
});

test("loads self-links and repeated links between the same nodes", async ({ page }) => {
  await rpc(page, "load", { input: doc("self-and-repeated-links.json") });
  expect(await rows(page, "MATCH (a)-[r]->(b) RETURN a.id AS a, type(r) AS t, b.id AS b, r.w AS w ORDER BY t, w")).toEqual([
    { a: "n1", t: "SELF", b: "n1", w: null },
    { a: "n1", t: "T", b: "n2", w: 2 },
    { a: "n1", t: "T", b: "n2", w: null }, // nulls sort last
  ]);
});

test("loads number arrays: whole as integers, fractional or mixed as floats, strings and booleans as they are", async ({ page }) => {
  const r = await rpc(page, "load", { input: doc("number-arrays.json") });
  expect(r.ok, JSON.stringify(r)).toBe(true);
  const [row] = await rows(
    page,
    "MATCH (n) RETURN n.ints AS ints, valueType(n.ints) AS ti, n.floats AS floats, valueType(n.floats) AS tf, " +
      "n.mixed_whole_fractional AS mixed, valueType(n.mixed_whole_fractional) AS tm, n.strings AS s, n.bools AS b, " +
      "valueType(n.whole_scalar) AS tw, valueType(n.fractional_scalar) AS tfs",
  );
  expect(row).toMatchObject({ ints: [1, 2, 3], floats: [0.5, 1.5], mixed: [0, 1, 0.5], s: ["a", "b"], b: [true, false] });
  expect(row.ti).toContain("INTEGER");
  expect(row.tf).toContain("FLOAT");
  expect(row.tm).toContain("FLOAT");
  expect(row.tw).toContain("INTEGER");
  expect(row.tfs).toContain("FLOAT");
});

test("creates only the named indexes", async ({ page }) => {
  await rpc(page, "load", { input: doc("basic.json"), opts: { indexes: [{ label: "Page", property: "id" }] } });
  const idx = await rows(page, "SHOW INDEXES");
  expect(idx.map((i) => [i.labelsOrTypes, i.properties])).toEqual([[["Page"], ["id"]]]);
  await rpc(page, "fresh");
  await rpc(page, "load", { input: doc("basic.json") });
  expect(await rows(page, "SHOW INDEXES")).toEqual([]);
});

test("uses the descriptor's indexes and accepts agreeing data", async ({ page }) => {
  const descriptor = { version: 1, id: "g", revision: "r", data: { url: "g.json", nodes: 2, links: 1 }, indexes: [{ label: "Page", property: "slug" }] };
  const r = await rpc(page, "load", { input: doc("basic.json"), opts: { descriptor, indexes: [{ label: "Ignored", property: "x" }] } });
  expect(r.ok).toBe(true);
  expect((await rows(page, "SHOW INDEXES")).map((i) => i.properties)).toEqual([["slug"]]);
});

test("a scoped load adds the scope to every created node, and dropping it removes them", async ({ page }) => {
  await rpc(page, "load", { input: doc("basic.json") });
  const overlay = { version: 1, nodes: [{ id: "o1" }, { id: "o2" }], links: [{ source: "o1", target: "o2", type: "NOTE" }] };
  const r = await rpc(page, "load", { input: overlay, opts: { scope: "view-1" } });
  expect(r.ok).toBe(true);
  expect(await rows(page, "MATCH (n) WHERE n.scope = 'view-1' RETURN n.id AS id ORDER BY id")).toEqual([{ id: "o1" }, { id: "o2" }]);
  expect(await rows(page, "MATCH (n) WHERE n.scope IS NULL RETURN count(n) AS c")).toEqual([{ c: 2 }]);
  await rpc(page, "drop-scope", { name: "view-1" });
  expect(await rows(page, "MATCH (n) RETURN count(n) AS c")).toEqual([{ c: 2 }]);
  expect(await rows(page, "MATCH ()-[r:NOTE]->() RETURN count(r) AS c")).toEqual([{ c: 0 }]);
});

test("a scoped load rejects a scope key in a node's properties", async ({ page }) => {
  const input = { version: 1, nodes: [{ id: "a", properties: { scope: "mine" } }], links: [] };
  const r = await rpc(page, "load", { input, opts: { scope: "view-1" } });
  expect(r).toMatchObject({ ok: false, reason: "invalid-document", path: "nodes[0].properties.scope" });
});

test("a rejected document loads nothing and creates no index", async ({ page }) => {
  const r = await rpc(page, "load", {
    input: { version: 1, nodes: [{ id: "a" }, { id: "a" }], links: [] },
    opts: { indexes: [{ label: "P", property: "id" }] },
  });
  expect(r).toMatchObject({ ok: false, reason: "invalid-document", path: "nodes[1].id" });
  expect(await rows(page, "MATCH (n) RETURN count(n) AS c")).toEqual([{ c: 0 }]);
  expect(await rows(page, "SHOW INDEXES")).toEqual([]);
});

test("data that disagrees with its descriptor is rejected and nothing is loaded", async ({ page }) => {
  const base = { version: 1, id: "g", data: { url: "g.json", nodes: 2, links: 1 } };
  const wrongCount = await rpc(page, "load", { input: doc("basic.json"), opts: { descriptor: { ...base, revision: "r", data: { ...base.data, nodes: 3 } } } });
  expect(wrongCount).toMatchObject({ ok: false, reason: "mismatch", path: "nodes" });
  const wrongRevision = await rpc(page, "load", { input: doc("with-revision.json"), opts: { descriptor: { ...base, revision: "other", data: { url: "g.json", nodes: 1, links: 0 } } } });
  expect(wrongRevision).toMatchObject({ ok: false, reason: "mismatch", path: "revision" });
  expect(await rows(page, "MATCH (n) RETURN count(n) AS c")).toEqual([{ c: 0 }]);
});

test("loads 5,000 pages with their links", async ({ page }) => {
  await page.goto("/engine.html");
  const pages = 5000;
  const input = await page.evaluate((n) => {
    const nodes = Array.from({ length: n }, (_, i) => ({ id: `p${i}`, labels: ["Page"], properties: { slug: `/p/${i}` } }));
    const links = [];
    for (let i = 0; i < n; i++) for (let j = 1; j <= 5; j++) links.push({ source: `p${i}`, target: `p${(i * 7 + j * 13) % n}`, type: "LINKS_TO" });
    return { version: 1, nodes, links };
  }, pages);
  const r = await rpc(page, "load", { input });
  expect(r).toMatchObject({ ok: true, result: { nodes: pages, links: pages * 5 } });
  expect(await rows(page, "MATCH ()-[r:LINKS_TO]->() RETURN count(r) AS c")).toEqual([{ c: pages * 5 }]);
});
