// Errors the way react-admin reads them: an `Error` with a numeric `status` and a message (data-model.md "Errors").
import type { ProviderClient } from "./types.js";

export type ProviderStatus = 400 | 404 | 503;

export class ProviderError extends Error {
  readonly status: ProviderStatus;

  constructor(status: ProviderStatus, message: string) {
    super(message);
    this.name = "ProviderError";
    this.status = status;
  }
}

export const badRequest = (message: string): ProviderError => new ProviderError(400, message);
export const notFound = (message: string): ProviderError => new ProviderError(404, message);
export const unavailable = (message: string): ProviderError => new ProviderError(503, message);

/**
 * The error for an `error` string in the engine's result envelope, or null when there is none. A uniqueness violation
 * is a duplicate `id`; anything else is a 400 carrying the engine's message (FR-017).
 */
export function fromEnvelope(envelope: { error: string | null }, resource?: string): ProviderError | null {
  if (!envelope.error) return null;
  if (/ConstraintValidationFailed/.test(envelope.error)) {
    const where = resource ? ` in "${resource}"` : "";
    return badRequest(`a record with this id already exists${where} (${envelope.error})`);
  }
  return badRequest(envelope.error);
}

/** The 503 for a client whose status is `failed`: its failure reason and message (FR-018). */
export function fromClientFailure(client: Pick<ProviderClient, "diagnostic">): ProviderError {
  const d = client.diagnostic;
  const reason = d?.reason ?? "failed";
  const detail = d?.engineError ? `: ${d.engineError}` : "";
  return unavailable(`the graph is not available (${reason})${detail}`);
}

/**
 * Turn what the core's client throws into a `ProviderError` where it has one. The client throws a `GraphError`
 * (with a `reason`) when a call does not produce a result: `timeout`, `lost`, `failed`, `trap` and so on. Engine
 * errors are not thrown by the client; they arrive in the envelope. Anything else is returned unchanged.
 */
export function fromCoreError(e: unknown): unknown {
  if (e instanceof ProviderError) return e;
  const g = e as { name?: string; reason?: string; message?: string } | null;
  if (g && g.name === "GraphError") {
    if (g.reason === "timeout") return unavailable("the statement timed out");
    return unavailable(g.message && g.message !== g.reason ? g.message : `the graph is not available (${g.reason})`);
  }
  return e;
}
