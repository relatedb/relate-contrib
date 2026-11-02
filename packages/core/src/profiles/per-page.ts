// The `per-page` profile (multi-page, no router, ADR-001 2.4): each page starts its own client, and a departing
// page drops its views' data when it is hidden.
import { createClient } from "../client/client.js";
import type { Client, ClientOptions } from "../client/types.js";

export function perPageClient(options: ClientOptions): Client {
  const client = createClient({ ...options, navigation: "multi-page" });
  // A multi-page navigation fires no router event, so `pagehide` is the departure. Dropping is best effort: data
  // that outlives the page is removed by the sweep when the next worker starts.
  globalThis.addEventListener?.("pagehide", () => void client.dropAllScopes());
  return client;
}
