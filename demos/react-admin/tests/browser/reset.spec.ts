// covers-ra: FR-023, FR-028, SC-005
import { readFileSync } from "node:fs";
import { expect, test } from "./fixtures.js";
import { createPerson, expectTotal, listRoute, openList, plain, rows } from "./helpers.js";

test("the reset control offers a copy first, asks for confirmation, then resets and loads the demo data again", async ({ page }) => {
  await createPerson(page, { name: "Reset Candidate", title: "tester", age: 33 });
  await openList(page, plain("people"));
  await expectTotal(page, 51);

  await page.getByRole("button", { name: "Reset demo data" }).click();

  // the copy: the export of the stored records, which need no allowLoss
  const download = page.waitForEvent("download");
  await page.getByRole("button", { name: "Download a copy" }).click();
  const file = JSON.parse(readFileSync((await (await download).path())!, "utf8"));
  expect(file.format).toBe("relate-application-export");
  expect(file.application).toMatchObject({ name: "react-admin-demo", version: 1 });
  expect(file.document.nodes).toHaveLength(6 + 51 + 10);
  expect(file.document.nodes.some((n: any) => n.properties?.name === "Reset Candidate")).toBe(true);
  await expect(page.getByRole("status").filter({ hasText: "Saved 67 records" })).toBeVisible();

  // cancelling leaves the records
  await page.getByRole("button", { name: "Cancel" }).click();
  await openList(page, plain("people"));
  await expectTotal(page, 51);

  // a reset needs a second, explicit step
  await page.getByRole("button", { name: "Reset demo data" }).click();
  await page.getByRole("button", { name: "Discard and reset" }).click();
  await expect(page.getByRole("button", { name: "Confirm reset" })).toBeVisible();
  await expectTotal(page, 51); // nothing has happened yet
  await page.getByRole("button", { name: "Confirm reset" }).click();

  await expectTotal(page, 50);
  await page.goto(listRoute("people", { q: "Reset Candidate" }));
  await expectTotal(page, 0);
  await openList(page, plain("companies"));
  await expectTotal(page, 6);
  await openList(page, plain("people"));
  expect((await rows(page)).length).toBe(10);
});
