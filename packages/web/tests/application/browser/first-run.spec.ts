// covers-app: FR-001, FR-003, FR-004, FR-005, FR-006, SC-001
import { expect, test } from "./fixtures.js";
import { count, makeClient, openHarness, openReady, rows, seed, status, waitStatus } from "./helpers.js";

const app = (over: Record<string, unknown> = {}) => ({ name: "notes", version: 1, seed, indexes: [{ label: "Person", property: "name" }], ...over });

for (const navigation of ["client-routing", "multi-page"]) {
  test(`seeds an empty origin once and keeps the visitor's record across a reload (${navigation})`, async ({ page }) => {
    await openHarness(page);
    await makeClient(page, app(), { navigation });
    await waitStatus(page, "ready");
    expect(await count(page, "MATCH (p:Person) RETURN count(p) AS c")).toBe(3);
    await rows(page, "CREATE (:Person {id: 'v', name: 'Visitor'})");

    await openHarness(page);
    const changed = { ...seed, nodes: [{ id: "z", labels: ["Zed"] }], links: [] };
    await makeClient(page, app({ seed: changed }), { navigation });
    await waitStatus(page, "ready");
    expect(await count(page, "MATCH (p:Person) RETURN count(p) AS c")).toBe(4);
    expect(await count(page, "MATCH (z:Zed) RETURN count(z) AS c")).toBe(0);
    expect(await rows(page, "MATCH (p:Person {id: 'v'}) RETURN p.name AS n")).toEqual([{ n: "Visitor" }]);
    const marker = await rows(page, "MATCH (m:_RelateApplication) RETURN m.state AS s, m.version AS v");
    expect(marker).toEqual([{ s: "ready", v: 1 }]);
  });
}

test("indexes named in the seed exist after the first run and after a reload, once each", async ({ page }) => {
  await openReady(page, app());
  const first = await rows(page, "SHOW INDEXES");
  expect(first.filter((r) => r.name === "Person_name")).toHaveLength(1);
  await openReady(page, app());
  const again = await rows(page, "SHOW INDEXES");
  expect(again.filter((r) => r.name === "Person_name")).toHaveLength(1);
});

test("two names on one origin do not see each other's data", async ({ page }) => {
  await openReady(page, app({ name: "one" }));
  await rows(page, "CREATE (:Only {id: 'x'})");
  await page.evaluate(() => window.client!.destroy());
  await page.waitForTimeout(500);
  await openReady(page, app({ name: "two" }));
  expect(await count(page, "MATCH (o:Only) RETURN count(o) AS c")).toBe(0);
});

test("a seed with the marker's label fails the client and names the label", async ({ page }) => {
  await openHarness(page);
  await makeClient(page, app({ seed: { version: 1, nodes: [{ id: "m", labels: ["_RelateApplication"] }], links: [] } }));
  await waitStatus(page, "failed");
  const d = await page.evaluate(() => window.client!.diagnostic);
  expect(d?.engineError).toContain("_RelateApplication");
});

test("creation throws for an invalid name and starts nothing", async ({ page }) => {
  await openHarness(page);
  const message = await page.evaluate(() => {
    try {
      window.app.make({ name: "a b", version: 1, seed: { version: 1, nodes: [], links: [] } });
      return null;
    } catch (e) {
      return (e as Error).message;
    }
  });
  expect(message).toMatch(/application\.name must match/);
  expect(await page.evaluate(() => window.client === undefined)).toBe(true);
});

test("a seed given as a descriptor loads its data and its indexes", async ({ page }) => {
  await openHarness(page);
  await page.route("**/seed/data.json", (r) => r.fulfill({ contentType: "application/json", body: JSON.stringify(seed) }));
  const descriptor = { version: 1, id: "seed", revision: "r1", data: { url: "/seed/data.json", nodes: 3, links: 1 }, indexes: [{ label: "Person", property: "n" }] };
  await makeClient(page, { name: "viadesc", version: 1, seed: descriptor });
  await waitStatus(page, "ready");
  expect(await count(page, "MATCH (p:Person) RETURN count(p) AS c")).toBe(3);
  expect((await rows(page, "SHOW INDEXES")).map((r) => r.name)).toContain("Person_n");
  expect(await status(page)).toBe("ready");
});
