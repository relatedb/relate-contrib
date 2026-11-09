# @relate/web

The name follows the `@relate` namespace; see `design/notes/2026-11-08-relate-contrib-rename.md`.

Hosts a small embedded graph database (the engine's browser build, `@relate/relate-wasm`) in a web page. The database runs in a
dedicated worker behind a client, so loading and querying never block the page. A crash, a timeout or a
failed load is contained: the worker is replaced, subscriptions re-run, and after three failed attempts the
client reports `failed` and the page keeps working. The package is framework-agnostic; a framework adapter
only wires it into that framework's build and rendering.

Decisions behind it: `design/adr/ADR-001` (worker hosting, two navigation profiles), `ADR-002` (the graph data
format), `ADR-003` (the graph descriptor). The specification and plan are in `specs/001-core-package/`.

## Install

```sh
pnpm add @relate/web @relate/relate-wasm
```

`@relate/relate-wasm` is a peer dependency. Until it is published to npm this repository vendors a
pinned build (see `vendor/README.md`). The package has no other runtime dependency.

## Use

```js
import engineUrl from "@relate/relate-wasm/relate_bg.wasm?url"; // the bundler places the binary
import { createSiteClient, attachView } from "@relate/web";

const client = createSiteClient({
  engineUrl,                                     // where the engine's binary is served from
  graph: { descriptor: "/graph/descriptor.json" }, // or { document } for a graph given as data
  navigation: "client-routing",                  // or "multi-page"
});

// Components subscribe; there is no retry code. The listener hears the status, the generation and the rows.
client.subscribe("MATCH (p:Page) RETURN count(p) AS pages", null, ({ status, rows }) => {
  if (rows) show(rows[0].pages); else showPlaceholder(status);
});

// Data that belongs to one page view: added on arrival, dropped on departure, added again after a replacement.
const view = attachView(client, { version: 1, nodes: [{ id: "note", labels: ["Note"] }], links: [] });
// ...on leaving the page:
await view.detach();

// A statement typed by a visitor has a timeout and a stop control.
const run = client.run(statementFromTheBox);
stopButton.onclick = () => run.stop();
```

A page's first render must not depend on the instance, and navigation must work without it. Results are the
engine's JSON envelope, unaltered (`columns`, `rows`, `stats`, `error`, ...); an engine error arrives in
`error`, it does not throw.

## Navigation profiles

| `navigation` | Profile | Instance | Store |
|---|---|---|---|
| `client-routing` | persistent | one for the visit, held in module state | off unless `store: true` |
| `multi-page` | per-page | one per page, started by that page | on when the graph has a descriptor |

`createSiteClient` returns the visit's one client under `client-routing` and a new client per call under
`multi-page`. `createClient` always makes a new, independent client (a page may have several).

## Graph data

- **Data document** (`graph-data.schema.json`): `{ version: 1, nodes: [{ id, labels?, properties? }], links: [{ source, target, type, properties? }] }`.
  Properties live only under `properties`. Validate in a build step with `import { validate } from "@relate/web/validate"`.
- **Descriptor** (`graph-descriptor.schema.json`): `{ version: 1, id, revision, data: { url, nodes, links }, indexes? }`, served beside the
  data. With a descriptor, a store can be restored without fetching the data when the `revision` has not
  changed. Without one there is no store and no revision.

## Failure

`client.status` is `loading`, `ready`, `recovering` or `failed`. In `failed`, `client.diagnostic` says why,
`client.failureMessage()` gives wording that suggests reporting an issue (at `issueUrl` if you set it; nothing is
sent by the package), and `client.retry()` starts again.

## Application graphs

A graph the visitor writes (an admin tool's records, a notes editor, a game save) is an *application graph*: one
named, durable graph in the browser, seeded once and carried forward by migrations. It is a different mode of
`createClient`, with its own store (`app-<name>`); the content graph and its cache above are unchanged. Decided in
ADR-009; the tests are in `tests/application/`.

```ts
import { createClient, inRanges } from "@relate/web";

const client = createClient({
  engineUrl,
  navigation: "client-routing",              // or "multi-page"; application mode does not depend on it
  application: {
    name: "notes",                           // [A-Za-z0-9_-]{1,60}; two applications on one origin must not share a name
    version: 2,                              // the schema version this code expects; a positive integer
    seed: seedDocumentOrDescriptorOrUrl,     // loaded once, on first run, never over stored data
    indexes: [{ label: "Note", property: "title" }],   // for a plain-document seed; created on first run only
    migrations: {                            // target version -> ordered steps; keys are 2..version, consecutive
      2: [
        inRanges({
          label: "Note", property: "n", step: 500,
          statement: "MATCH (x:Note) WHERE x.n >= $from AND x.n < $to AND x.slug IS NULL SET x.slug = toLower(x.title)",
        }),
      ],
    },
    // onUnavailable: "memory" | "fail"   (default "memory")  no browser store
    // onError:       "fail" | "memory"   (default "fail")    the store could not be opened
    // whenLocked:    "wait" | "memory"   (default "wait")    another tab holds the store
  },
});
```

Options are checked when the client is created; a bad name, version, migration key or step throws and starts
nothing. Query results are the engine's envelope, unaltered.

**The marker.** The store records its format, schema version and state in one node labelled `_RelateApplication`
(`state` is `seeding`, `ready` or `importing`). It is an ordinary node: queries return it, and a statement can delete
it, which makes the store `store-unmarked`. The label is reserved; a seed that contains it is rejected. Export and the
range helper skip it.

**Failures.** The client is `failed` with `client.diagnostic.reason` one of these, and the stored data is left as it is:

| Reason | Meaning |
|---|---|
| `store-unmarked` | data with no marker (not created by this application, or the marker was deleted) |
| `store-newer` | written by a newer version or format than this code |
| `import-interrupted` | an import did not finish |
| `store-unreadable` | the store could not be opened (or holds two markers) |
| `unavailable` | no browser store and `onUnavailable: "fail"` |
| `migration-failed` | a step failed, a version has no migration, or a step changed the marker; the message names the version, and the store is at the last completed version |

None of them is retried automatically. `client.resetApplication()` discards the stored data and seeds again; it is
the only call that does (besides the recovery of a first run that never finished). Offer an export before it.

**Storage.** `client.storage` is `{ kind, reason?, persisted }` and `client.on("storage", fn)` hears changes.
`durable`: writes reach the store. `waiting` with reason `locked`: another tab holds the store; the client stays
`loading`, retries every second and keeps queries pending (before the first report `kind` is `waiting` with no reason:
nothing has been opened yet). `memory` with reason `unavailable`, `locked` or `error`: the data is not stored; a
client in memory never becomes durable. `persisted` is the browser's `navigator.storage.persisted()` or `null`.
The core never asks for persistent storage: call `client.requestPersistence()` from a user action (Chromium and
WebKit refused it, and Firefox shows a prompt that can leave the promise pending in the tests' browsers). `client.storageEstimate()`
returns `{ usage, quota }`. A page ends its worker on `pagehide`, so the next page of a multi-page site finds the store free.

**Export and import.** `await client.exportApplication({ allowLoss })` returns `{ envelope, losses }`; the envelope is
`{ format: "relate-application-export", version: 1, application: { name, version }, document }` with the graph data
format's document, sorted so that export, import and export agree. The format cannot carry everything the engine
stores, so the report counts, by kind: `integer-beyond-2^53` (written as the nearest number), `whole-number-float`
(written as an integer), `date` and `duration` (written as text), `point` and `empty-list` (left out) and
`node-without-string-id` (the node and its relationships are left out; `droppedLinks` counts them). Without
`allowLoss: true` the call rejects with a `GraphError` of reason `export-loss` that carries the report. `await
client.importApplication(envelope)` rejects an envelope for another name or a newer version, validates the whole
document, then marks the store `importing`, resets it, loads the document, marks it `ready` and migrates. It does not
export first, and the core never calls it.

**The rule for migrations.** The core cannot make a migration atomic: a statement over many nodes can be partly applied
if the worker is stopped. Write each step bounded, each safe to run again (a `WHERE` that skips what is done), and rely
on the core to write the version last. `inRanges` runs your statement over windows `[$from, $to)` of a numeric
property; the statement must carry its own filter. A failing step leaves the store at the last completed version and
the next load resumes there. Two rules are checked when a store is migrated: every version from the stored one up to the
application's needs an entry (a missing one fails with `migration-failed` naming the version, and the version is not
advanced), and a step may not change the marker. A step that does is failed and the marker is put back, so a statement
that reaches every node, such as `MATCH (n) SET …`, needs `WHERE NOT n:_RelateApplication`.

**A content graph and an application graph on one page** use two clients, each with its own worker and store; no
statement spans them.

**Not measured:** power loss and system crashes, Firefox and WebKit beyond the sizes in `reports/`, a write that
exceeds the browser's quota, the time to migrate a large store, and the cause of the occasional write stalls seen in
SPIKE-008. The figures in ADR-009 §6 are single runs on one machine.

## Supported browsers

Tested, in the package's own suite: current Chromium, Firefox and WebKit on desktop. Mobile and older browsers
are not measured. WebKit needs a persistent profile for the origin-private file system (as Playwright's
default WebKit context is not); where the store is unavailable the package loads the graph in memory.

## Conformance check for adapters

`@relate/web/conformance` exports `runConformance({ baseUrl, profile, browser })` and the scenarios. Serve the
example pages (`conformance/example-site/`) through your adapter and run it for each profile and browser; a failure
names the broken behavior. Playwright is an optional peer dependency used by the runner. The contract is in
`specs/001-core-package/contracts/conformance.md`.

## Develop

```sh
pnpm run build:wasm          # build the vendored engine (needs Rust, wasm-bindgen-cli, binaryen)
pnpm install
pnpm --filter @relate/web build
pnpm --filter @relate/web test:unit
pnpm --filter @relate/web test:browsers      # Chromium, Firefox and WebKit
pnpm --filter @relate/web test:conformance
pnpm --filter @relate/web test:package       # packs the core and installs it in a clean project
pnpm --filter @relate/web test:trace         # every requirement has a passing, tagged test
pnpm --filter @relate/web test:application           # application graphs: unit tests against the real engine in Node
pnpm --filter @relate/web test:application-browsers  # Chromium, Firefox and WebKit
pnpm --filter @relate/web test:application-trace     # every requirement of specs/006 has a passing, tagged test
```

Load-time baselines are in `tests/baselines/` (one file per browser and environment; `REL_ENV` names the
environment, `REL_UPDATE_BASELINE=1` rewrites them). A run fails when a time is more than twice its baseline.
