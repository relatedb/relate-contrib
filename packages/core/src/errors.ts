export type Reason = "trap" | "timeout" | "lost" | "stopped" | "failed" | "unsupported" | "worker-error" | "invalid-document";

/** Why a call to the client did not produce a result. Engine errors are not GraphErrors: they arrive in the envelope. */
export class GraphError extends Error {
  readonly reason: Reason;
  readonly engineError: string | undefined;

  constructor(reason: Reason, message?: string, engineError?: string) {
    super(message ?? reason);
    this.name = "GraphError";
    this.reason = reason;
    this.engineError = engineError;
  }
}
