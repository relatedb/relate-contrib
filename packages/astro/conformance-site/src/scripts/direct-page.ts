// A script that asks for a visit-lifetime graph directly, outside any page setup, twice.
import { graph } from "related-web-astro/client";

const first = graph("example");
const second = graph("example");
(window as unknown as { __gwDirect: unknown }).__gwDirect = { same: first === second, client: first };
first.subscribe("MATCH (n:Page) RETURN count(n) AS c", null, (u) => {
  if (u.rows) document.querySelector("[data-direct-count]")!.textContent = String(u.rows[0]?.c);
});

// Asking for a page-lifetime graph and for an unknown graph directly must fail loudly.
const errors: string[] = [];
for (const name of ["small", "nope"]) {
  try {
    graph(name);
  } catch (e) {
    errors.push((e as Error).message);
  }
}
document.querySelector("[data-direct-errors]")!.textContent = JSON.stringify(errors);
