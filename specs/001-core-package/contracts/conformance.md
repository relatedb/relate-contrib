# Contract: Example site, conformance check and test plan

**Feature**: [spec.md](../spec.md) | **Plan**: [plan.md](../plan.md)

## Module `@relate/web/conformance`

```ts
export const exampleDescriptor: Descriptor;        // names the graph, its revision and indexes
export const exampleDocument: GraphDocument;       // a few hundred pages with links
export const scenarios: Scenario[];                // framework-neutral scenario definitions

export interface RunOptions {
  baseUrl: string;                // where the adapter serves the example pages
  profile: "client-routing" | "multi-page";
  browser: "chromium" | "firefox" | "webkit";
}
export function runConformance(options: RunOptions): Promise<Report>;   // Playwright, optional peer
```

The example site serves descriptors and data documents (`/descriptor.json` and `/graph.json` for variant a,
`/descriptor-b.json` and `/graph-b.json` for variant b, a descriptor whose counts disagree with its data, and a
descriptor whose data location does not exist) and plain HTML pages: an index, two content pages that each run a
per-page query and show the shared graph's page count, a notes page that adds two notes of its own and drops them
when the page is left, a broken page whose graph can never load, and a blank page with no script.

The scenarios drive the pages by what a visitor can see. Every observable thing is a `data-rel-*` element or
attribute: `data-rel-status`, `data-rel-generation`, `data-rel-count`, `data-rel-updates`, `data-rel-instance`,
`data-rel-profile`, `data-rel-restored`, `data-rel-failure`, `data-rel-last-error`, `data-rel-notes`, links marked
`data-rel-link`, and buttons marked `data-rel-action` (`trap`, `timeout`), plus `data-rel-state` on `<html>` for the
current status. The pages read their profile from a `navigation` query parameter and their graph from a `variant`
parameter. An adapter serves the same pages through its framework and produces the same markup and behavior.

## Scenarios (each run under both profiles unless noted)

| Id | Checks | Spec |
|---|---|---|
| C-01 | per-page query returns the rows the document implies; first render and links work before ready | US1, FR-006 |
| C-02 | shared graph visible from several pages; same worker and generation in `client-routing`; restored without replay in `multi-page` | US4, US5 |
| C-03 | a graph whose data location does not exist: status `failed` after three attempts, links and text usable, message shown | US3, FR-033 |
| C-04 | trap during a query: replaced, generation increases, subscriptions re-run, no reload | US3, FR-009 |
| C-05 | timeout: reason `timeout`, replacement | US3, US6 |
| C-06 | scoped data added on arrival, dropped on departure, re-added after replacement | US4, FR-026 |
| C-07 | changed descriptor `revision`: store reset, data fetched, new data shown and none of the old (`multi-page`); matching revision: no request for the data | US5, FR-022, FR-038, SC-013 |
| C-08 | store held by a second page: in-memory fallback within 5 s plus replay | US5, FR-012 |
| C-09 | configured profile decides (`navigation`) | FR-028 |
| C-10 | data cached from another deploy (revision or count mismatch): rejected, nothing loaded | FR-039 |
| C-11 | store emptied while its stored copy remains: treated as stale, graph reloaded | FR-038 |

A failing scenario names the behavior in the report (US7 scenario 2).

## Test plan: where each requirement is tested (the traceability table, SC-005)

This table is created at the start and filled as tests land; the build fails if a requirement id from the
spec has no row with a passing test.

| Requirements | Layer | File (planned) |
|---|---|---|
| FR-013, FR-014, FR-019 | unit (Node), schema parity (data document and descriptor) | `tests/unit/validate.test.ts`, `tests/unit/descriptor.test.ts` |
| FR-015 to FR-018 | browser (loader against the engine) | `tests/browser/loader.spec.ts` |
| FR-019 encoding | unit and browser | `tests/unit/encode.test.ts`, `loader.spec.ts` |
| FR-001 to FR-007 | browser | `tests/browser/client.spec.ts` |
| FR-008 to FR-012, FR-033, FR-034 | unit (state machine) and browser (faults) | `tests/unit/failure.test.ts`, `tests/browser/faults.spec.ts` |
| FR-020, FR-025, FR-026 | browser | `tests/browser/persistent.spec.ts` |
| FR-021 to FR-024, FR-027, FR-028 | browser | `tests/browser/per-page.spec.ts` |
| FR-037 to FR-039 | unit and browser (stored copy, count check, mismatch) | `tests/unit/descriptor.test.ts`, `tests/browser/stored-copy.spec.ts` |
| FR-029 | browser | `tests/browser/conformance.spec.ts` |
| FR-030, FR-031 | browser (all three engines, baselines) | `tests/browser/timing.spec.ts` |
| FR-032 | script: install the packed tarball in a clean project | `tests/package/clean-install.test.ts` |
| FR-035 | browser | `tests/browser/several-clients.spec.ts` |
| FR-036 | unit and browser | `tests/unit/events.test.ts`, `faults.spec.ts` |

Success criteria map to: SC-001 and SC-002 and SC-003 (`timing.spec.ts`, baseline rule), SC-004
(`faults.spec.ts`), SC-005 (the table check), SC-006 (`validate.test.ts`, `loader.spec.ts`), SC-007
(`per-page.spec.ts`), SC-008 (`conformance.spec.ts`), SC-009 (`persistent.spec.ts`), SC-010
(`faults.spec.ts`), SC-011 (the three-browser run), SC-012 (`events.test.ts`), SC-013 (`stored-copy.spec.ts`).

## Fault injection (no test code in the shipped worker)

- trap: a statement with about a thousand nested parentheses;
- runaway: a three-way cartesian `count(*)` on a 1,000-page document;
- worker error: a `workerFactory` in the test that returns a worker which throws on a marked message;
- locked store: a second page holding the same store name;
- stale store: a changed descriptor `revision`; an emptied store with its stored copy left in place;
- a deliberately broken variant of the example pages (`__break=no-rerun`, subscriptions not re-run after a replacement), used to show that the check fails and names the broken behavior.
