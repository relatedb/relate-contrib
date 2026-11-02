import type { Client, ClientOptions } from "../client/types.js";
import { perPageClient } from "./per-page.js";
import { persistentClient } from "./persistent.js";

/** The client for this page under the configured profile; the configured `navigation` value decides. */
export function createSiteClient(options: ClientOptions): Client {
  return options.navigation === "client-routing" ? persistentClient(options) : perPageClient(options);
}

export { perPageClient } from "./per-page.js";
export { persistentClient, resetPersistentClient } from "./persistent.js";
