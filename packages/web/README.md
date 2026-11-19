# @relate/contrib-web

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
pnpm add @relate/contrib-web @relate/relate-wasm
```

`@relate/relate-wasm` is a peer dependency. Until it is published to npm this repository vendors a
pinned build (see `vendor/README.md`). The package has no other runtime dependency.

## Use

```js
import engineUrl from "@relate/relate-wasm/relate_bg.wasm?url"; // the bundler places the binary
import { createSiteClient, attachView } from "@relate/contrib-web";

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
  Properties live only under `properties`. Validate in a build step with `import { validate } from "@relate/contrib-web/validate"`.
- **Descriptor** (`graph-descriptor.schema.json`): `{ version: 1, id, revision, data: { url, nodes, links }, indexes? }`, served beside the
  data. With a descriptor, a store can be restored without fetching the data when the `revision` has not
  changed (the cache's record is its entry in the catalog, below). Without one there is no store and no revision.

## Failure

`client.status` is `loading`, `ready`, `recovering` or `failed`. In `failed`, `client.diagnostic` says why,
`client.failureMessage()` gives wording that suggests reporting an issue (at `issueUrl` if you set it; nothing is
sent by the package), and `client.retry()` starts again.

## Application graphs

A graph the visitor writes (an admin tool's records, a notes editor, a game save) is an *application graph*: one
named, durable graph in the browser, seeded once and carried forward by migrations. It is a different mode of
`createClient`, with its own store (`app-<name>`). Decided in ADR-009; the record of what the store holds is a catalog
entry (ADR-010, below); the tests are in `tests/application/` and `tests/catalog/`.

```ts
import { createClient, inRanges } from "@relate/contrib-web";

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

**What the store holds.** The graph holds only your data: no bookkeeping node, so a count of all nodes is the seed's plus
the visitor's. The core records the application's schema version and state in its entry in the catalog (see *The
catalog*), written before data changes and confirmed after, so an interrupted first run, migration, import or reset is
recognised on the next open.

**Failures.** The client is `failed` with `client.diagnostic.reason` one of these, and the stored data is left as it is:

| Reason | Meaning |
|---|---|
| `store-unmarked` | data with no catalog entry (not created by this application, or its entry was removed); a node labelled `_RelateApplication`, the record an earlier form kept in the graph, is named in the message |
| `store-newer` | written by a newer version than this code, or the catalog is of a newer format |
| `import-interrupted` | an import did not finish |
| `store-lost` | the entry says the store was filled and it is empty: its data is gone |
| `store-unreadable` | the store could not be opened, or the catalog does not parse, or this application's entry is malformed; for a catalog, see `resetCatalog()` |
| `unavailable` | no browser store (or no Web Locks) and `onUnavailable: "fail"` |
| `migration-failed` | a step failed or a version has no migration; the message names the version, and the store is at the last completed version |

None of them is retried automatically. `client.resetApplication()` discards the stored data and seeds again; it is
the only call that does (besides the recovery of a first run or reset that never finished). Offer an export before it.
A catalog that does not parse, or is of a newer format, is never written over, so `resetApplication()` cannot recover
from it either: use `resetCatalog()` for a catalog that does not parse (see below). An application whose seed had no
nodes records that, and its empty store is valid; it cannot notice that the records the visitor added are gone.

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
export first, and the core never calls it. A page stopped between the reset and the load leaves `importing`, so the next
open fails `import-interrupted` and never seeds over the emptied store.

**The rule for migrations.** The core cannot make a migration atomic: a statement over many nodes can be partly applied
if the worker is stopped. Write each step bounded, each safe to run again (a `WHERE` that skips what is done), and rely
on the core to record the version after each version's last step. `inRanges` runs your statement over windows
`[$from, $to)` of a numeric property; the statement must carry its own filter. A failing step leaves the store at the last
completed version and the next load resumes there. Every version from the stored one up to the application's needs an
entry: a missing one fails with `migration-failed` naming the version, and the version is not advanced. The core keeps
nothing in the graph, so a statement that reaches every node, such as `MATCH (n) SET …`, is valid as it stands.

**A content graph and an application graph on one page** use two clients, each with its own worker and store; no
statement spans them.

## The catalog

The core keeps one record per persisted graph, content caches and application graphs alike, in one file,
`relate-web/catalog.json`, beside the engine's `relate/` directory (ADR-010). Every read and write takes the Web Lock
`relate-web:catalog` (shared to read, exclusive to write), so several tabs lose no update. A browser with the file storage
but no Web Locks counts as having no storage. An entry has a `kind` (`application` or `cache`), a `name`, a `state`
(`ready`, or `seeding`, `migrating`, `importing`, `resetting`, `loading` or `removing` for an operation started and not yet
confirmed), `updatedAt`, and, for an application, `version` and `seeded`, or, for a cache, `revision`. A cache restores only
from a `ready` entry at the descriptor's revision over a store with all its nodes; anything else rebuilds, and a catalog that
cannot be used never fails the page: the cache is loaded in memory, leaving the durable store and the catalog as they were. The core removes only a stale cache's contents and a
leftover `relate-web/<id>.json`; it never removes an application graph.

Three calls are exported. None opens a store, and each needs the origin-private storage and Web Locks (`CatalogError` with
reason `unavailable` otherwise).

```ts
import { listGraphs, removeGraph, resetCatalog } from "@relate/contrib-web";

const { catalog, items } = await listGraphs({ sizes: true });
// catalog: "ok" | "missing" | "unreadable" | "newer"
// each item: { store, kind?, name?, state?, version? | revision?, registered, present, status, size?, modified? }
// status: "ok" | "unregistered" (a directory with no entry) | "missing" (an entry with no directory)

await removeGraph("app-notes", { kind: "application" });  // discards the visitor's data: say so
await resetCatalog();                                       // deletes the file; no store is touched
```

`listGraphs` works while another tab holds a store; sizes and modification times cost a file read per slot file, so ask for
them only when needed (about 6 ms per store in Chromium, 20 ms in Firefox and WebKit, in the spike's runs). `removeGraph`
refuses a name that is not an `app-<name>` or `rel-<id>` store (`not-a-store`), a `kind` that disagrees with the store's name or is
missing (`kind-mismatch`: removing an application graph always takes an explicit `application`), and a store another tab holds (`locked`, with its entry left as its holder wrote it). Removing a
graph the catalog does not know (`unregistered`) needs only its name and kind. Two removals of one store never overlap, in one tab or several. `resetCatalog()` is the way out of a catalog that
does not parse; afterwards a store with data and no entry fails `store-unmarked` until you import an export or call
`resetApplication()`.

**What a clear looks like to a page.** Clearing a site's storage, or the browser evicting it, removes the stores and the
catalog together, and the browser gives no signal. A page that starts cold then sees no entry and no data, the same as a first
visit, and applies the seed. A client that already held a store sees a storage error instead. An application that cannot
afford silent loss needs a copy outside the origin (an export, a server record).

**Not measured:** power loss and system crashes, Firefox and WebKit beyond the sizes in `reports/`, a write that
exceeds the browser's quota, the time to migrate a large store, and the cause of the occasional write stalls seen in
SPIKE-008. The figures in ADR-009 §6 are single runs on one machine.

## Supported browsers

Tested, in the package's own suite: current Chromium, Firefox and WebKit on desktop. Mobile and older browsers
are not measured. WebKit needs a persistent profile for the origin-private file system (as Playwright's
default WebKit context is not); where the store is unavailable the package loads the graph in memory.

## Conformance check for adapters

`@relate/contrib-web/conformance` exports `runConformance({ baseUrl, profile, browser })` and the scenarios. Serve the
example pages (`conformance/example-site/`) through your adapter and run it for each profile and browser; a failure
names the broken behavior. Playwright is an optional peer dependency used by the runner. The contract is in
`specs/001-core-package/contracts/conformance.md`.

## Develop

```sh
pnpm run build:wasm          # build the vendored engine (needs Rust, wasm-bindgen-cli, binaryen)
pnpm install
pnpm --filter @relate/contrib-web build
pnpm --filter @relate/contrib-web test:unit
pnpm --filter @relate/contrib-web test:browsers      # Chromium, Firefox and WebKit
pnpm --filter @relate/contrib-web test:conformance
pnpm --filter @relate/contrib-web test:package       # packs the core and installs it in a clean project
pnpm --filter @relate/contrib-web test:trace         # every requirement has a passing, tagged test
pnpm --filter @relate/contrib-web test:application           # application graphs: unit tests against the real engine in Node
pnpm --filter @relate/contrib-web test:application-browsers  # Chromium, Firefox and WebKit
pnpm --filter @relate/contrib-web test:application-trace     # every requirement of specs/006 has a passing, tagged test
```

Load-time baselines are in `tests/baselines/` (one file per browser and environment; `REL_ENV` names the
environment, `REL_UPDATE_BASELINE=1` rewrites them). A run fails when a time is more than twice its baseline.
