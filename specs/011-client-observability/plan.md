# Implementation Plan: A Page Can Observe a Core Client

**Branch**: `client-observability` | **Date**: 2026-11-27 | **Spec**: [spec.md](spec.md)

**Input**: Feature specification from `/specs/011-client-observability/spec.md`

## Summary

Implement the 2026-11-27 amendment of ADR-001 in `@relate/contrib-web`: a `statement` event, `client.revision` with a `revision` event, and `client.info`. The page already receives each query's envelope and parses it, so statements a page sends (`query`, `run`, a subscription re-run) are reported from the page with no new messages. Statements the worker runs itself (loading, seeding, migrating, importing, scoped add and drop) are reported by the worker in one new message sent before the job's last message. Planning found three shapes the ADR leaves open ([research.md](research.md)): where internal statements are observed, how the engine version is read (the engine has no version call; a procedure answers), and how the worker is told whether anyone listens.

## Technical Context

**Language/Version**: TypeScript (ESM), as the core; Node 24 for unit tests.

**Primary Dependencies**: none new. The engine is `@relate/relate-wasm` (peer, supported 1.3.0 to 1.4.x).

**Storage**: none.

**Testing**: Vitest in Node with a fake worker that answers the client's messages from a real in-memory engine (the core's `Engine.fromDb`); Playwright in Chromium, Firefox and WebKit against the real worker for the end-to-end and no-listener checks; the engine-assumptions canary gains the one engine behaviour this uses.

**Target Platform**: the browser (worker and page), Node for unit tests.

**Project Type**: a change to one library package; no new package.

**Performance Goals**: no listener means no payload is built and no measurable change (SC-003). The worker always counts writes, which costs one parse of each internal statement's reply; measured in a perf test and labelled as one environment's figures.

**Constraints**: no existing name, option, event, message result or timing changes (FR-011); all existing tests pass unchanged (SC-006); adapters untouched.

**Scale/Scope**: about 150 lines in the page-side client and events, 60 in the worker, one new module for the write rule and parameter capture; tests and docs.

## Constitution Check

- **I. Decisions Before Code**: implements ADR-001's accepted amendment of 2026-11-27 and names it. Planning found no decision beyond it; the three open shapes are mechanics inside the ADR's decision (research R1 to R3), recorded here, not new architecture.
- **II. Core First, Thin Adapters**: the change is in the core only; adapters inherit it.
- **III. The Page Works Without the Graph**: nothing is read during first render; `info` is null until ready.
- **IV. Faults Are Contained**: the new worker message is plain data; a trap or replacement discards pending records and the next generation restarts the revision. No statement runs outside the worker.
- **V. Specified Behavior Is Tested and Measured**: every FR has a tagged test (`covers-obs:`); the no-listener cost is measured and labelled.
- **VI. The Engine Stays Upstream**: the engine is used through its package interface (`execute`, and the `dbms.components()` procedure). The open item (do all changes move a counter) is raised upstream, not patched around.

No violations.

## Project Structure

```text
specs/011-client-observability/   spec.md, plan.md, research.md, data-model.md, contracts/client-api.md, quickstart.md, tasks.md
packages/web/src/client/
  statements.ts   (new)  the write rule, parameter capture, the revision counter
  events.ts              + statement, revision
  client.ts              origin threaded through execute; reports; info; revision
  types.ts               + revision, info
packages/web/src/worker/
  engine.ts              + a tap for internal statements; engine version
  worker.ts              + tally around internal jobs; `observe` message; engine version on ready
  protocol.ts            + StatementsMessage, ObserveMessage, init.observe, ready.engine
packages/web/tests/observability/{unit,browser,trace}/
packages/web/README.md   the three additions
```

**Structure Decision**: one new page-side module holds the rules so the event, the revision and the tests share one definition of a write.
