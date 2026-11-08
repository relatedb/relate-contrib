<script>
  // A small graph written into the page (spec FR-013 to FR-015): no descriptor, no revision, no stored copy, no extra request. The same
  // element is written on the server and in the browser; hydration removes an element that only the server wrote (research V-3).
  import { checkInline, escapeJson } from "@relate/web/build";
  import { getConfig } from "./context.js";

  /** @type {{ id: string, document: unknown, config?: import("@relate/web/build").InlineConfig, page: string }} */
  let { id, document, config: settings, page } = $props();

  const context = getConfig();
  const text = $derived.by(() => {
    if (typeof page !== "string" || page === "") {
      throw new Error(`@relate/sveltekit: inline graph "${String(id)}": GraphData needs a page prop, the page's path, to name the page in its error messages`);
    }
    if (!context) throw new Error(`@relate/sveltekit: ${page}: inline graph "${String(id)}": GraphData was used outside RelateProvider`);
    // Duplicates are judged within one server render. In the browser the provider outlives pages, so each check starts empty.
    const seen = typeof window === "undefined" ? context.renderIds : new Set();
    return escapeJson(checkInline("@relate/sveltekit", page, id, document, settings, seen, context.catalog.map((g) => g.id)));
  });
</script>

{@html `<script type="application/json" data-relate-graph="${id}">${text}</script>`}
