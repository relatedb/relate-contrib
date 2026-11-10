// covers-ra: FR-020, FR-022, FR-028, SC-005
// The demo in a browser: first run, lists, sort, search, filters, paging, the statement panel, the relation picker, the
// company page, and what survives a reload. Each test starts from an empty origin (a fresh context; WebKit's profile
// is emptied), so the seed is applied once per test and the data is the seed's.
import { readFileSync } from "node:fs";
import { expect, test } from "./fixtures.js";
import { createPerson, expectTotal, listRoute, names, openList, plain, rows, total } from "./helpers.js";

type Seed = { nodes: Array<{ id: string; labels: string[]; properties: Record<string, any> }>; links: Array<{ source: string; target: string; type: string }> };
const seed = JSON.parse(readFileSync(new URL("../../src/seed.json", import.meta.url), "utf8")) as Seed;
const people = seed.nodes.filter((n) => n.labels[0] === "Person");
const companyOf = (id: string) => seed.links.find((l) => l.source === id && l.type === "WORKS_AT")?.target;

test("first run shows the seed's records, and a reload does not create them twice", async ({ page }) => {
  await openList(page, plain("people"));
  await expectTotal(page, 50);
  await openList(page, plain("companies"));
  await expectTotal(page, 6);
  await openList(page, plain("projects"));
  await expectTotal(page, 10);

  await page.reload();
  await expect(page.locator("tbody tr").first()).toBeVisible({ timeout: 60_000 });
  await expectTotal(page, 10);
  await openList(page, plain("people"));
  await expectTotal(page, 50);
  await openList(page, plain("companies"));
  await expectTotal(page, 6);
});

test("the people list sorts, searches, filters and pages, and shows its total", async ({ page }) => {
  await openList(page, plain("people"));
  // default: by name ascending, ten to a page
  const firstPage = await names(page);
  expect(firstPage).toHaveLength(10);
  expect([...firstPage].sort()).toEqual(firstPage);

  // sort by age: ascending first, then descending (the button's name says which sort is next)
  const ages = async () => (await rows(page)).map((cells) => Number(cells[2]));
  const inOrder = (a: number[], dir: "asc" | "desc") => a.length === 10 && a.every((v, i) => i === 0 || (dir === "asc" ? a[i - 1]! <= v : a[i - 1]! >= v));
  await page.getByRole("button", { name: "Sort by age ascending" }).click();
  await expect(page.getByRole("button", { name: "Sort by age descending" })).toBeVisible();
  // wait for the whole page to be in order, not just its first row: the rows of the old sort stay until the new ones arrive
  await expect.poll(async () => { const a = await ages(); return inOrder(a, "asc") && a[0] === 22; }).toBe(true);
  await page.getByRole("button", { name: "Sort by age descending" }).click();
  await expect.poll(async () => { const a = await ages(); return inOrder(a, "desc") && a[0] === 60; }).toBe(true);

  // paging: the second page holds other people, and the total does not change
  const first = await names(page);
  await page.getByRole("button", { name: "Go to page 2" }).click();
  await expect.poll(async () => (await names(page))[0]).not.toBe(first[0]);
  await expectTotal(page, 50);

  // search
  await openList(page, plain("people"));
  await page.getByRole("textbox", { name: "Search" }).fill("Ashford");
  await expect.poll(() => total(page)).toBe(people.filter((p) => String(p.properties.name).includes("Ashford")).length);
  for (const n of await names(page)) expect(n).toContain("Ashford");

  // a reference filter, a comparison and a boolean together, sorted by age descending
  await openList(page, listRoute("people", { company: "c01", age_gte: 30, active: true }, { field: "age", order: "DESC" }));
  const expected = people
    .filter((p) => companyOf(p.id) === "c01" && p.properties.age >= 30 && p.properties.active)
    .sort((a, b) => b.properties.age - a.properties.age || (a.id < b.id ? -1 : 1));
  await expect.poll(() => total(page)).toBe(expected.length);
  expect(await names(page)).toEqual(expected.map((p) => p.properties.name));
});

test("the statement panel shows what the provider ran", async ({ page }) => {
  await openList(page, plain("people"));
  await page.getByTestId("statements").locator("summary").click();
  const panel = page.getByTestId("statements");
  await expect(panel).toContainText("CREATE CONSTRAINT");
  await expect(panel).toContainText("SKIP $skip LIMIT $limit");
  await expect(panel).toContainText("count(n) AS total");
  await expect(panel).toContainText('"skip":0');
});

test("the relation picker moves a person to another company, and the company pages show it", async ({ page }) => {
  await page.goto("/#/people/p01/edit");
  await expect(page.getByLabel("Name")).toHaveValue("Avery Ashford", { timeout: 60_000 });
  await page.getByRole("combobox").click();
  await page.getByRole("option", { name: "Lumen Works" }).click();
  await page.getByRole("button", { name: "Save" }).click();
  await page.waitForURL(/#\/people(\?.*)?$/);

  // the first table of a company page is its people (the second is its projects, where a lead shows too)
  const peopleTable = () => page.locator("table").first();
  await page.goto("/#/companies/c03/show");
  await expect(peopleTable().getByText("Avery Ashford", { exact: true })).toBeVisible({ timeout: 30_000 });
  await page.goto("/#/companies/c01/show");
  await expect(peopleTable().getByText("Avery Dunmore", { exact: true })).toBeVisible({ timeout: 30_000 });
  await expect(peopleTable().getByText("Avery Ashford", { exact: true })).toHaveCount(0);
});

test("a company page lists that company's people and projects", async ({ page }) => {
  await page.goto("/#/companies/c01/show");
  const expectedPeople = people.filter((p) => companyOf(p.id) === "c01").map((p) => String(p.properties.name));
  expect(expectedPeople).toHaveLength(9);
  const peopleTable = page.locator("table").first();
  for (const name of expectedPeople) await expect(peopleTable.getByText(name, { exact: true })).toBeVisible({ timeout: 30_000 });
  const projects = seed.nodes.filter((n) => n.labels[0] === "Project" && seed.links.some((l) => l.source === n.id && l.type === "OWNED_BY" && l.target === "c01"));
  expect(projects.length).toBeGreaterThan(0);
  for (const p of projects) await expect(page.getByText(String(p.properties.name), { exact: true })).toBeVisible();
  // another company's people are not listed
  await expect(peopleTable.getByText("Avery Brooks", { exact: true })).toHaveCount(0);
});

test("a created person survives a reload, and the seed is not applied again", async ({ page }) => {
  await createPerson(page, { name: "Zed Newcomer", title: "tester", age: 41 });
  await openList(page, plain("people"));
  await expectTotal(page, 51);

  await page.reload();
  await expect(page.locator("tbody tr").first()).toBeVisible({ timeout: 60_000 });
  await expectTotal(page, 51);
  await openList(page, listRoute("people", { q: "Newcomer" }));
  await expect.poll(() => total(page)).toBe(1);
  expect((await rows(page))[0]).toContain("Zed Newcomer");
  await openList(page, plain("companies"));
  await expectTotal(page, 6);
});

test("deleting a company leaves its people with an empty company", async ({ page }) => {
  await page.goto("/#/companies/c06/edit");
  await expect(page.getByLabel("Name")).toHaveValue("Tidewater Foods", { timeout: 60_000 });
  await page.getByRole("button", { name: "Delete" }).click();
  const confirm = page.getByRole("button", { name: "Confirm" });
  if (await confirm.isVisible().catch(() => false)) await confirm.click();
  await expect(page.locator("tbody tr").first()).toBeVisible({ timeout: 30_000 });
  await openList(page, plain("companies"));
  await expectTotal(page, 5);

  const finley = people.find((p) => companyOf(p.id) === "c06")!;
  await openList(page, listRoute("people", { q: String(finley.properties.name) }));
  await expect.poll(() => total(page)).toBe(1);
  const [cells] = await rows(page);
  expect(cells![0]).toBe(finley.properties.name);
  expect(cells![4]).toBe(""); // no company
  // nobody else lost a company
  await openList(page, plain("people"));
  await expectTotal(page, 50);
});
