# Data Model: A Page Can Observe a Core Client

## StatementEvent (FR-001 to FR-004)

| Field | Type | Rule |
|---|---|---|
| `statement` | string | the Cypher text as sent |
| `ms` | number or null | the engine's `elapsed_ms` from the reply; null when the reply has none |
| `error` | string or null | the reply's `error` |
| `stats` | object | the reply's counters; `{}` when the reply has none |
| `write` | boolean | true exactly when any value in `stats` is a non-zero number |
| `origin` | `"query"`, `"run"`, `"subscription"`, `"internal"` | why it ran |
| `params`, `paramsTruncated`, `paramsError` | optional | only for a listener that opted in (R6) |

## Revision (FR-006, FR-007)

`client.revision`: a non-negative integer. Restarts at 0 when a worker becomes ready; rises by one per write statement (R4). Event `revision`: `{ revision, generation }`.

## ClientInfo (FR-009, FR-010)

`client.info`: `null` unless the status is `ready`; else `{ name: string or null, kind: "application" | "cache" | "memory", readOnly: false, engine: string or null }`.

## Worker messages (internal)

- `StatementsMessage`: `{ type: "statements", writes: number, records: StatementRecord[] | null }`, sent before a job's terminal message.
- `ObserveMessage` (page to worker): `{ type: "observe", on: boolean }`; init gains `observe: boolean`.
- `ReadyMessage` gains `engine: string | null`.
