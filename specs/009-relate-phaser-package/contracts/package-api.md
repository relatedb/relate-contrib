# Contract: the package's exports

The first release is below 1.0 and unstable; names may change until a second consumer has used them (ADR-012 2.1). Types are shown to fix the shape, not as final signatures.

## Queue

```ts
class Bridge {
  constructor(query: (statement: string, params?: object | null) => Promise<Envelope>);
  static forClient(client: Pick<Client, "query">): Bridge;
  enqueue(statement: string, params?: object | null): Promise<Row[]>;
  readonly pending: number;
  idle(): Promise<void>;
  onSettle(listener: () => void): () => void;   // returns an unsubscribe
}
class StatementError extends Error {}           // the engine refused a statement
```

Order is the contract. A `GraphError` from the client passes through unchanged.

## Cache

```ts
type CacheClient = Pick<Client, "query" | "status" | "generation" | "on" | "onGeneration">;

class ReplyCache<S> {
  constructor(opts: { client: CacheClient; bridge?: Bridge; initial: S; load: (bridge: Bridge) => Promise<(state: S) => void> });
  readonly state: S;
  readonly version: number;
  readonly pending: string | null;
  readonly status: "loading" | "ready" | "recovering" | "failed";
  start(): Promise<void>;                        // the first load; then follows generations
  commit(patch: (state: S) => void): void;
  act(key: string, a: {
    optimistic?: (state: S) => () => void;       // applies at once; returns its undo
    run: (commit: (patch: (state: S) => void) => void, bridge: Bridge) => Promise<void>;
  }): Promise<{ ok: true } | { ok: false; error: Error }>;
  reload(): Promise<void>;
  destroy(): void;                               // stops following the client
}
```

`act` never throws. While `status` is `failed` it resolves at once with `{ ok: false, error }`, where `error` is a `GraphError` with reason `failed`, and queues nothing. A further `act` waits for a pending one. A rejected `reload` keeps the previous state.

## Throwaway client

```ts
function createThrowawayClient(
  options: Omit<ClientOptions, "graph" | "application" | "store">,
  document: GraphDocument,
): Client;                                       // throws TypeError if an `application` key is present
```

## Scene helper

```ts
function versionWatch(cache: { readonly version: number }): () => boolean;
function watchCache(
  scene: { events: { on(e: string, fn: () => void): unknown; off(e: string, fn: () => void): unknown } },
  cache: { readonly version: number },
  redraw: () => void,
): () => void;                                   // call the result to release
```

`watchCache` calls `redraw` from the scene's `update` event only when `versionWatch` reports a change, and releases itself on the scene's `shutdown` event.

## Not exported

Statements, seeding, reveal-only reads, undo, hex drawing, fog and clouds (ADR-012 2.6).
