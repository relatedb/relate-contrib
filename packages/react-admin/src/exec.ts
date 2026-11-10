// Sending one statement: the failed-client check, the observer, the timeout, and the translation of what the client
// throws. Every statement the package sends goes through here (FR-018, FR-019, FR-033).
import { fromClientFailure, fromCoreError } from "./errors.js";
import type { Params } from "./filter.js";
import type { Row } from "./record.js";
import type { ProviderClient, ProviderOptions } from "./types.js";

export const DEFAULT_TIMEOUT_MS = 10_000;

export interface ResultEnvelope {
  columns?: string[];
  rows: Row[];
  error: string | null;
}

export async function execute(client: ProviderClient, options: ProviderOptions, statement: string, params: Params): Promise<ResultEnvelope> {
  if (client.status === "failed") throw fromClientFailure(client);
  try {
    options.onStatement?.(statement, params);
  } catch {
    // an observer is for display; it must not break a data call
  }
  try {
    return (await client.query(statement, params, { timeoutMs: options.timeoutMs ?? DEFAULT_TIMEOUT_MS })) as ResultEnvelope;
  } catch (e) {
    throw fromCoreError(e);
  }
}
