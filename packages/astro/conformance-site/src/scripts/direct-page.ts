// A script that asks for a visit-lifetime graph directly, outside any page setup, twice.
import { graph } from "related-web-astro/client";

const first = graph("example");
const second = graph("example");
(window as unknown as { __gwDirect: unknown }).__gwDirect = { same: first === second, client: first };
first.subscribe("MATCH (n:Page) RETURN count(n) AS c", null, (u) => {
  if (u.rows) document.querySelector("[data-direct-count]")!.textContent = String(u.rows[0]?.c);
});
