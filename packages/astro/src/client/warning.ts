// The wording of the development-time profile check; no dependency on the integration's virtual modules.

/** The warning for a configured setting and the router's presence, or null when they agree. */
export function profileWarning(configured: "multi-page" | "client-routing", routerPresent: boolean): string | null {
  if (configured === "client-routing" && !routerPresent) {
    return 'related-web-astro: navigation is "client-routing" but this page has no ClientRouter, so every page load starts a new graph client. Add ClientRouter to the layout, or set navigation to "multi-page".';
  }
  if (configured === "multi-page" && routerPresent) {
    return 'related-web-astro: navigation is "multi-page" but this page has ClientRouter, so the graph client is not kept across navigations. Set navigation to "client-routing" to keep it.';
  }
  return null;
}
