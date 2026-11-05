// For the pages that carry inline graphs: asks for each one, counts its nodes and shows the count. The clients are
// exposed for the adapter's own tests (`window.__gwClients`).
import { onPage } from "@relate/web-astro/client";
import type { Client } from "@relate/web-core";

onPage(
  (page) => {
    const clients: Record<string, Client> = {};
    const offs: Array<() => void> = [];
    for (const el of Array.from(document.querySelectorAll("script[data-related-graph]"))) {
      const name = el.getAttribute("data-related-graph")!;
      const client = page.graph(name);
      clients[name] = client;
      const show = (text: string): void => {
        const target = document.querySelector(`[data-inline-count="${name}"]`);
        if (target) target.textContent = text;
        const gen = document.querySelector(`[data-inline-generation="${name}"]`);
        if (gen) gen.textContent = String(client.generation);
      };
      offs.push(client.on("status", () => show("…")));
      offs.push(client.subscribe("MATCH (n) RETURN count(n) AS c", null, (u) => u.rows && show(String(u.rows[0]?.c))));
    }
    (window as unknown as { __gwClients: Record<string, Client> }).__gwClients = clients;
    return () => offs.forEach((off) => off());
  },
  { selector: "[data-inline-page]" },
);
