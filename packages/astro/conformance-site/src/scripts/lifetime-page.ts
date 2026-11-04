// For the lifetime pages: a registered page-lifetime graph (`small`), with a log of what the adapter did, kept in module
// state so it survives router navigations. The adapter's own tests read `window.__gwLog`.
import { onPage } from "related-web-astro/client";

const log: string[] = [];
(window as unknown as { __gwLog: string[] }).__gwLog = log;
const title = () => document.querySelector("[data-gw-title]")?.textContent ?? "?";

onPage(
  (page) => {
    const here = title();
    log.push(`setup:${here}`);
    const client = page.graph("small");
    log.push(`same:${page.graph("small") === client}`);
    const destroy = client.destroy.bind(client);
    client.destroy = () => {
      log.push(`destroy:${here}`);
      try {
        // a departure that ends the document leaves no log, so the record is kept where a reload can read it
        sessionStorage.setItem("gw-destroyed", [sessionStorage.getItem("gw-destroyed"), here].filter(Boolean).join("|"));
      } catch {
        /* storage may be unavailable */
      }
      destroy();
    };
    const status = document.querySelector("[data-life-status]");
    const count = document.querySelector("[data-life-count]");
    const restored = document.querySelector("[data-life-restored]");
    const offs = [
      client.on("status", ({ status: s }) => status && (status.textContent = s)),
      client.on("timing", ({ phase, restored: r }) => phase === "total" && restored && (restored.textContent = String(r))),
      client.subscribe("MATCH (n:Item) RETURN count(n) AS c", null, (u) => u.rows && count && (count.textContent = String(u.rows[0]?.c))),
    ];
    (window as unknown as { __gwClient: unknown }).__gwClient = client;
    return () => {
      log.push(`cleanup:${here}`);
      offs.forEach((off) => off());
    };
  },
  { selector: "[data-lifetime-page]" },
);

// A second registration, limited to pages that carry its marker, to show that a selector keeps it off the others.
onPage(
  () => {
    log.push(`marked:${title()}`);
  },
  { selector: "[data-marked]" },
);
