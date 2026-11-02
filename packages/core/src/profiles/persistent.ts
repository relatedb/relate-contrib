// The `persistent` profile (client-side routing, ADR-001 2.3): one client for the visit, held in module state, so
// it survives route changes. A page that remounts its islands keeps the same client.
import { createClient } from "../client/client.js";
import type { Client, ClientOptions } from "../client/types.js";

let visitClient: Client | null = null;

/** The visit's client; created on the first call, with that call's options. Later calls return it unchanged. */
export function persistentClient(options: ClientOptions): Client {
  return (visitClient ??= createClient({ ...options, navigation: "client-routing" }));
}

/** Destroy the visit's client and forget it (tests, and sites that tear the graph down). */
export function resetPersistentClient(): void {
  visitClient?.destroy();
  visitClient = null;
}
