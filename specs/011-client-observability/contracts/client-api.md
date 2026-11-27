# Contract: additions to the client (ADR-001 amendment 2026-11-27)

```ts
interface Events {
  // existing: status, replaced, storage, timing
  statement: StatementEvent;
  revision: { revision: number; generation: number };
}

interface Client {
  // existing members unchanged
  readonly revision: number;
  readonly info: ClientInfo | null;
  /** The only change to `on`: an optional third argument, honoured for `statement` only. */
  on<E extends keyof Events>(event: E, listener: (payload: Events[E]) => void, options?: { params?: boolean }): Unsubscribe;
}
```

Guarantees: one `statement` event per statement that completes after the listener was added; no payload is built when nothing listens; a throwing listener does not disturb the client; `revision` never decreases within a generation; `info` is null before ready; nothing here changes a result, a timing or an existing event.
