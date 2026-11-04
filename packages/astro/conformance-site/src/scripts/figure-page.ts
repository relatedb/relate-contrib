// Shows how long the core says a graph took to load, for the load-figure pages (single measurements, see research R-10).
import { onPage } from "related-web-astro/client";

onPage(
  (page) => {
    const name = document.querySelector("[data-figure-page]")!.getAttribute("data-figure-page")!;
    const client = page.graph(name);
    const off = client.on("timing", ({ phase, ms }) => {
      if (phase === "total") document.querySelector("[data-figure-total]")!.textContent = String(Math.round(ms));
    });
    return off;
  },
  { selector: "[data-figure-page]" },
);
