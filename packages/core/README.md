# @relate/web-core

`@relate/web-core` is a working name; see `design/notes/2026-11-02-project-name.md`.

Hosts a small embedded graph database (the engine's browser build, `@neo4j-labs/cypherlite-wasm`) in a web page. The database runs in a
dedicated worker behind a client, so loading and querying never block the page. A crash, a timeout or a
failed load is contained: the worker is replaced, subscriptions re-run, and after three failed attempts the
client reports `failed` and the page keeps working. The package is framework-agnostic; a framework adapter
only wires it into that framework's build and rendering.

Decisions behind it: `design/adr/ADR-001` (worker hosting, two navigation profiles), `ADR-002` (the graph data
format), `ADR-003` (the graph descriptor). The specification and plan are in `specs/001-core-package/`.

## Install

```sh
pnpm add @relate/web-core @neo4j-labs/cypherlite-wasm
```

`@neo4j-labs/cypherlite-wasm` is a peer dependency. Until it is published to npm this repository vendors a
pinned build (see `vendor/README.md`). The package has no other runtime dependency.

## Use

```js
import engineUrl from "@neo4j-labs/cypherlite-wasm/cypherlite_bg.wasm?url"; // the bundler places the binary
import { createSiteClient, attachView } from "@relate/web-core";

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
  Properties live only under `properties`. Validate in a build step with `import { validate } from "@relate/web-core/validate"`.
- **Descriptor** (`graph-descriptor.schema.json`): `{ version: 1, id, revision, data: { url, nodes, links }, indexes? }`, served beside the
  data. With a descriptor, a store can be restored without fetching the data when the `revision` has not
  changed. Without one there is no store and no revision.

## Failure

`client.status` is `loading`, `ready`, `recovering` or `failed`. In `failed`, `client.diagnostic` says why,
`client.failureMessage()` gives wording that suggests reporting an issue (at `issueUrl` if you set it; nothing is
sent by the package), and `client.retry()` starts again.

## Supported browsers

Tested, in the package's own suite: current Chromium, Firefox and WebKit on desktop. Mobile and older browsers
are not measured. WebKit needs a persistent profile for the origin-private file system (as Playwright's
default WebKit context is not); where the store is unavailable the package loads the graph in memory.

## Conformance check for adapters

`@relate/web-core/conformance` exports `runConformance({ baseUrl, profile, browser })` and the scenarios. Serve the
example pages (`conformance/example-site/`) through your adapter and run it for each profile and browser; a failure
names the broken behavior. Playwright is an optional peer dependency used by the runner. The contract is in
`specs/001-core-package/contracts/conformance.md`.

## Develop

```sh
pnpm run build:wasm          # build the vendored engine (needs Rust, wasm-bindgen-cli, binaryen)
pnpm install
pnpm --filter @relate/web-core build
pnpm --filter @relate/web-core test:unit
pnpm --filter @relate/web-core test:browsers      # Chromium, Firefox and WebKit
pnpm --filter @relate/web-core test:conformance
pnpm --filter @relate/web-core test:package       # packs the core and installs it in a clean project
pnpm --filter @relate/web-core test:trace         # every requirement has a passing, tagged test
```

Load-time baselines are in `tests/baselines/` (one file per browser and environment; `REL_ENV` names the
environment, `REL_UPDATE_BASELINE=1` rewrites them). A run fails when a time is more than twice its baseline.
