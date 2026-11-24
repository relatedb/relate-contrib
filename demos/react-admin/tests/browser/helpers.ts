import { expect, type Page } from "@playwright/test";

/** Open a demo page (a hash route) and wait until its list has rows. */
export async function openList(page: Page, route = "/#/people"): Promise<void> {
  await page.goto(route);
  await expect(page.locator("tbody tr").first()).toBeVisible({ timeout: 60_000 });
  // while the first query runs the table shows empty placeholder rows; wait for the records themselves (slower on a runner's WebKit)
  await expect.poll(async () => (await names(page)).some((n) => n !== ""), { timeout: 60_000 }).toBe(true);
}

/** The text of each cell of each row of the list on screen. */
export async function rows(page: Page): Promise<string[][]> {
  return page.locator("tbody tr").evaluateAll((trs) => trs.map((tr) => [...tr.querySelectorAll("td")].map((td) => (td.textContent ?? "").trim())));
}

/** The first cell (the name) of each row. */
export async function names(page: Page): Promise<string[]> {
  return (await rows(page)).map((cells) => cells[0] ?? "");
}

/** The total of the list on screen, from "1-10 of 50", 0 when the list says there are no results, or -1 before the list has rendered. */
export async function total(page: Page): Promise<number> {
  const pagination = page.locator(".MuiTablePagination-displayedRows").first();
  const emptyOrUnrendered = async (): Promise<number> => ((await page.getByText(/found using the current filters|No results found/i).count()) > 0 ? 0 : -1);
  if ((await pagination.count()) === 0) return emptyOrUnrendered();
  // The pagination can leave the page between asking whether it is there and reading it (the list re-renders to its empty
  // message). `textContent` waits for an element that is gone for as long as the test lasts, so it is given a moment and
  // the poll asks again.
  const text = await pagination.textContent({ timeout: 2_000 }).catch(() => null);
  if (text === null) return emptyOrUnrendered();
  const m = /of\s+(\d+)/.exec(text);
  return m ? Number(m[1]) : -1;
}

/** Wait until the list on screen shows this total (a hash change keeps the old rows on screen until the new ones arrive). */
export async function expectTotal(page: Page, expected: number): Promise<void> {
  await expect.poll(() => total(page), { timeout: 60_000 }).toBe(expected); // a runner's browser can take longer than 30 s to show a query's answer
}

/** A list route with nothing remembered: react-admin keeps each list's filter, sort and page, so a test names them. */
export const plain = (resource: string): string => `/#/${resource}?filter=%7B%7D&sort=name&order=ASC&page=1&perPage=10`;

/** A list route with a filter object, as react-admin writes it in the address. */
export function listRoute(resource: string, filter: Record<string, unknown> = {}, sort?: { field: string; order: "ASC" | "DESC" }): string {
  const params = [`filter=${encodeURIComponent(JSON.stringify(filter))}`];
  if (sort) params.push(`sort=${sort.field}`, `order=${sort.order}`);
  return `/#/${resource}?${params.join("&")}`;
}

/** Create a person through the form and wait for the list. */
export async function createPerson(page: Page, fields: { name: string; title?: string; age?: number }): Promise<void> {
  await page.goto("/#/people/create");
  await page.getByLabel("Name").fill(fields.name);
  if (fields.title) await page.getByLabel("Title").fill(fields.title);
  if (fields.age !== undefined) await page.getByLabel("Age").fill(String(fields.age));
  await page.getByRole("button", { name: "Save" }).click();
  await expect(page.locator("tbody tr").first()).toBeVisible({ timeout: 30_000 });
}
