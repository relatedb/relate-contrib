import type { Client } from "@relate/contrib-web";

/**
 * The part of a core client the provider uses: it sends statements and reads the client's failure state, nothing else.
 * A client from `createClient`, `createSiteClient` or an adapter's helper satisfies it.
 */
export type ProviderClient = Pick<Client, "query" | "status" | "diagnostic">;

export interface ProviderOptions {
  /** Called once per statement, immediately before it is sent, with the statement text and its parameters. */
  onStatement?: (statement: string, params: object) => void;
  /** Passed as the timeout of every statement. The core's `query()` has none of its own. Default 10,000 ms. */
  timeoutMs?: number;
}
