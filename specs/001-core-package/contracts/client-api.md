# Contract: Public API of `@relate/web-core`

**Feature**: [spec.md](../spec.md) | **Plan**: [plan.md](../plan.md)

The surface adapters and pages build on. Signatures are in TypeScript for precision; names may change
during implementation if the behavior stays the same. `Envelope` is the engine's result envelope exactly as
it arrives (a parsed object with `columns`, `rows`, `stats`, `error`, and the rest); the package does not
reshape it (FR-003).

## Module `@relate/web-core`

```ts
export type Status = "loading" | "ready" | "recovering" | "failed";
export type Reason = "trap" | "timeout" | "lost" | "stopped" | "failed" | "unsupported" | "worker-error";

export type GraphSource =
  /** A descriptor (ADR-003), as data or as a URL; its `data.url` locates the data. Allows a store. */
  | { descriptor: Descriptor | string }
  /** A data document alone, as data or as a URL. No revision, no store; indexes come from the caller. */
  | { document: GraphDocument | string; indexes?: Array<{ label: string; property: string }> };

export interface ClientOptions {
  /** URL of the engine binary, handed to the engine's init (FR-007). */
  engineUrl: string | URL;
  /** The graph to load. */
  graph: GraphSource;
  /** Profile. "client-routing" is `persistent`; "multi-page" is `per-page` (FR-028). */
  navigation: "client-routing" | "multi-page";
  /** Use the store (needs a descriptor, FR-023). Default: false for client-routing, true for multi-page. */
  store?: boolean;
  /** Timeout applied to run() when none is given. Default 10000. */
  visitorTimeoutMs?: number;
  /** Target of the issue link in failure wording (FR-034). */
  issueUrl?: string;
  /** Replace the worker constructor (tests, adapters that must place the worker). */
  workerFactory?: () => Worker;
}

export function createClient(options: ClientOptions): Client;

/** The visit's client for the `persistent` profile (created once); a new client per call for `per-page`. */
export function createSiteClient(options: ClientOptions): Client;

export interface Client {
  readonly generation: number;
  readonly status: Status;
  /** Present when status is "failed". */
  readonly diagnostic: Diagnostic | null;

  /** Fixed statements. Resolves with the envelope; rejects with GraphError. */
  query(statement: string, params?: object, opts?: { timeoutMs?: number }): Promise<Envelope>;

  /** Visitor-supplied statements. Applies the default timeout; stop() replaces the instance (FR-010). */
  run(statement: string, params?: object, opts?: { timeoutMs?: number }): Run;

  /** Runs when ready and after every replacement; no retry code in the caller (FR-004). */
  subscribe(statement: string, params: object | null, listener: (u: Update) => void): Unsubscribe;

  /** Called when a new instance is ready, before subscriptions re-run (FR-005). */
  onGeneration(listener: (generation: number) => void | Promise<void>): Unsubscribe;

  /** Load a document as a scoped overlay; adds `scope` to every created node (FR-018). */
  addScoped(document: GraphDocument, scope: string): Promise<void>;
  /** Detach-delete the nodes of a scope (FR-026). */
  dropScope(scope: string): Promise<void>;

  on<E extends keyof Events>(event: E, listener: (payload: Events[E]) => void): Unsubscribe;

  /** From "failed": reset the failure count and start a new attempt (FR-033). */
  retry(): void;

  /** Wording for a failure, with the diagnostic and the issue link; sends nothing (FR-034). */
  failureMessage(): string;

  destroy(): void;
}

export interface Descriptor {
  version: 1;
  id: string;
  revision: string;
  data: { url: string; nodes: number; links: number };
  indexes?: Array<{ label: string; property: string }>;
}

export interface Run { result: Promise<Envelope>; stop(): void }
export interface Update { status: Status; generation: number; rows: unknown[] | null; error: string | null }
export interface Diagnostic { reason: Reason; failures: number; engineError: string | null }
export type Unsubscribe = () => void;

export class GraphError extends Error { reason: Reason; engineError?: string }

export interface Events {
  status: { status: Status; generation: number };
  replaced: { reason: "trap" | "timeout" | "worker-error" | "stopped"; generation: number };
  timing: { phase: "init" | "open" | "load" | "restore" | "total"; ms: number; restored: boolean };
}
```

### Behavior notes

- `query()` and `run()` resolve with the envelope even when `envelope.error` is set (engine errors are
  data). They reject only with `GraphError`: `trap`, `timeout`, `lost` (instance replaced mid-call),
  `stopped` (visitor stop), `failed` (status is failed).
- Events cost nothing with no listener (FR-036). Nothing is sent outside the page.
- `createSiteClient` with `client-routing` returns the same client on every call within the module's
  lifetime, so a router that keeps the page's module state keeps the client (FR-020). With `multi-page` it
  creates a client, restores from the store when a descriptor is given, and registers the `pagehide` departure for the page view's scope
  (FR-021, FR-027).
- A page may call `createClient` more than once; clients share nothing (FR-035).

## Module `@relate/web-core/validate`

```ts
export type ValidationResult =
  | { ok: true; document: GraphDocument }
  | { ok: false; path: string; message: string };

export function validate(input: unknown, opts?: { scoped?: boolean }): ValidationResult;
export function validateDescriptor(input: unknown): DescriptorValidationResult;
```

No browser APIs; usable in a build step or in Node (FR-013). `scoped: true` also rejects a `scope` key in
node properties (FR-018). The first problem is reported with a path such as `nodes[3].properties.id` or
`data.nodes`. `DescriptorValidationResult` has the same two shapes as `ValidationResult`, with a `descriptor`
in place of `document`. A separate check, `checkAgreement(descriptor, document)`, reports a `revision` or count
mismatch between the two (FR-039).

## Module `@relate/web-core/conformance`

See [conformance.md](conformance.md).
