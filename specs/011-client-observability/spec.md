# Feature Specification: A Page Can Observe a Core Client

**Feature Branch**: `client-observability` (spec directory `011-client-observability`)

**Created**: 2026-11-27

**Derived From**: ADR-001 (design/adr/ADR-001-worker-hosting-profiles.md), amendment of 2026-11-27

**Status**: Draft

**Input**: User description: "Implement the three additions ADR-001's 2026-11-27 amendment decides for the core package, from relatedb/relate-contrib#20, #21 and #24: a statement event, a write revision and a client description."

## Overview

A page's graph client (`@relate/contrib-web`) runs every statement in a worker. Today nothing outside the client can see what it does or what it is. A site that wants to count slow queries, report a failure together with the statement that failed, or assert in a test that a page ran no write has to wrap every call site, and still misses the statements the client runs itself (loading, seeding, migrating, importing) and the re-runs of subscribed statements. A tool that holds several clients on one page cannot tell them apart. A cache or derived view cannot tell that the graph changed, only that it was replaced.

This feature adds three things, all optional to use and free when unused: an event for each statement the worker runs, a counter that rises on every write, and a small description of the client. The decisions are in ADR-001's 2026-11-27 amendment and are not restated here; the requirements name them.

Who it serves:

- **Site builders and testers** want to log, count and assert on what a page's graph does.
- **Tool authors** (an export tool, an admin viewer, a developer tool) want to read what a client is and know when its data changed.
- **Package consumers who do not use any of this** want no cost: no work, no size they can feel, no change in behaviour.

Terms: a *statement* is one query the worker runs against the engine. A *write* is a statement that changed the graph, as the engine's own counters say. The *generation* is the client's existing count of how many times its graph was replaced. The *origin* of a statement says why it ran.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - See every statement a client runs (Priority: P1)

A developer registers a listener for statements on a client. For each statement the worker runs, the listener receives the statement text, how long the engine took, any error, the engine's change counters, whether the statement wrote, and why it ran: a direct query, a cancellable run, a re-run of a subscription, or the client's own load, seed, migration or import.

**Why this priority**: every other part builds on its definition of a write, and it is the part that answers the original need (log, count, assert).

**Independent Test**: run a client against the real engine, listen, issue each kind of statement and compare the events with what ran.

**Acceptance Scenarios**:

1. **Given** a listener and a read statement, **When** it runs through `query`, **Then** one event arrives with that statement, `write` false, origin `query`, and the engine's time and counters.
2. **Given** a statement that creates a node, **When** it runs, **Then** the event has `write` true, because a counter in its stats is non-zero.
3. **Given** a statement the engine rejects, **When** it runs, **Then** the event carries the error and `write` false.
4. **Given** a statement started with `run`, a subscribed statement that re-runs, and a client that loads, seeds, migrates or imports, **When** they execute, **Then** each event's origin is `run`, `subscription` or `internal` respectively.
5. **Given** no listener, **When** statements run, **Then** no payload is built.
6. **Given** a listener that does not opt in to parameters, **When** a statement with parameters runs, **Then** the payload carries no parameters.
7. **Given** a listener that opts in with `{ params: true }`, **When** a statement with parameters runs, **Then** the payload carries them serialised, and one larger than 4 KiB is cut at 4 KiB with a marker saying it was cut.
8. **Given** a listener that throws, **When** a statement runs, **Then** the client and other listeners are not disturbed.

---

### User Story 2 - Know that the graph changed (Priority: P1)

A developer reads a revision number on the client and listens for a revision event. The number rises by one on every statement that wrote, whoever ran it, and starts again at 0 whenever the graph is replaced. A cache drops its entries when it moves; a tool asks "has anything changed since I looked" by comparing two numbers.

**Why this priority**: the generation says the graph was replaced, and nothing says it was changed; live views and caches have to guess.

**Independent Test**: run writes, reads and failed statements and a worker replacement against the real engine and compare the revision.

**Acceptance Scenarios**:

1. **Given** a ready client, **When** a write statement completes, **Then** the revision is one higher and one revision event with the new value and the generation has been delivered.
2. **Given** a read statement or a statement that failed, **When** it completes, **Then** the revision does not move and no revision event is delivered.
3. **Given** the client's own seed, migration or import statements that write, **When** they complete, **Then** the revision counts them.
4. **Given** the graph is replaced (the worker was replaced and the data reloaded), **When** the new generation is ready, **Then** the revision restarts at 0 for that generation.
5. **Given** a subscription, **When** a write moves the revision, **Then** the subscription re-runs exactly as it did before this feature (no new re-runs).
6. **Given** no listener for revision events, **When** writes happen, **Then** the number still rises and nothing is built for an event.

---

### User Story 3 - Say what a client is (Priority: P2)

A tool holding several clients (a content graph and an application graph on one page) reads a description of each: its name, its kind, whether it is read-only and which engine version runs it. Before the client is ready, there is no description.

**Why this priority**: small and independent of the others, and it is what a tool needs to label what it reads.

**Independent Test**: create an application client, a cache client and an in-memory client and read each description before and after they are ready.

**Acceptance Scenarios**:

1. **Given** a client that is not yet ready, **When** the description is read, **Then** it is null.
2. **Given** an application client named `notes`, **When** it is ready, **Then** the description gives the store name, kind `application`, `readOnly` false and the engine version in use.
3. **Given** a content-cache client, **When** it is ready, **Then** the kind is `cache` and the name is its store name.
4. **Given** an unnamed in-memory client, **When** it is ready, **Then** the kind is `memory` and the name is null.
5. **Given** a worker that is replaced, **When** the new instance is ready, **Then** the description is available again and its engine version is that of the new instance.

---

### Edge Cases

- A statement that makes several changes (nodes and relationships): one event, one revision step.
- A statement in an interrupted or replaced worker that never answers: no event for it and no revision step; the next generation starts at 0.
- A statement that fails after changing something partway: the engine's reply decides; an error with non-zero counters is reported as written only if the counters say so.
- A listener added or removed while statements are in flight: it sees the statements that complete after it was added.
- Parameters that cannot be serialised: the payload says so instead of failing the statement.
- A change the engine does not count in its stats would be invisible to the event and the revision; this is an open question for the engine's maintainers (see Assumptions).
- An adapter's client (Astro, Next, Observable, SvelteKit, react-admin, Phaser) gets all three without adapter changes, since they hold a core client.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: The client MUST emit a `statement` event once for each statement the worker runs, with the statement text, the time the engine reports, the error or null, the engine's change counters, `write` and `origin` (ADR-001 amendment 2026-11-27, item 1).
- **FR-002**: `origin` MUST be `query` for a statement sent through `query`, `run` for one sent through `run`, `subscription` for a re-run of a subscribed statement, and `internal` for the client's own load, seed, migration and import statements.
- **FR-003**: `write` MUST be true exactly when any counter in the engine's stats for that statement is non-zero, read from the reply and never inferred from the statement text.
- **FR-004**: The payload of a `statement` event MUST NOT carry parameters unless the listener opted in with `{ params: true }`; with the opt-in it MUST carry them serialised, cut at 4 KiB with a marker that it was cut, and MUST say so when they cannot be serialised.
- **FR-005**: The client MUST build no `statement`, `revision` or description payload when nothing listens or reads (FR-036 of specs/001-core-package), and a throwing listener MUST NOT disturb the client or other listeners.
- **FR-006**: The client MUST expose a revision that rises by one on each statement whose `write` is true, internal statements included, and restarts at 0 with each new generation.
- **FR-007**: The client MUST emit a `revision` event with the new revision and the generation when the revision moves, and MUST NOT emit one for a statement that did not write.
- **FR-008**: Subscribed statements MUST re-run exactly when they did before this feature; the revision MUST NOT cause a re-run.
- **FR-009**: The client MUST expose a description with the name, the kind (`application`, `cache` or `memory`), whether the session is read-only and the engine version, once the status is ready, and null before.
- **FR-010**: The description's name MUST be the store name for `application` and `cache` and null for `memory`; `readOnly` MUST be false until a read-only open mode exists; the engine version MUST be that of the instance the worker loaded.
- **FR-011**: None of the three additions MUST change the behaviour, results or timing a client had before, when nothing uses them; no existing public name, option or event changes.
- **FR-012**: The package's documentation MUST describe the three additions, the definition of a write and its limit, and the opt-in for parameters.

### Key Entities

- **Statement event**: the statement, time, error, counters, `write` and `origin` of one statement the worker ran.
- **Revision**: the number of writes since the current generation began.
- **Client description**: the name, kind, read-only flag and engine version of a ready client.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: For a scripted sequence of reads, writes, failures, runs, subscription re-runs and the client's own load, seed and migration, the events received equal the statements run, each with the right origin and `write`, in 100 % of runs on each of the three browsers' engines (Chromium, Firefox, WebKit) and in Node.
- **SC-002**: The revision after a scripted sequence equals the number of its write statements, and is 0 again after each replacement of the graph.
- **SC-003**: With no listener, the time of a fixed batch of statements is within measurement noise of a client without the feature (no more than 2 % slower in the same run), and no payload objects are built.
- **SC-004**: A parameter payload of 10 KiB arrives cut to 4 KiB with the marker; without the opt-in, no parameter value appears in any event.
- **SC-005**: The description is null before ready and complete after, for each of the three kinds.
- **SC-006**: Every existing test of the core and of every adapter passes unchanged.
- **SC-007**: Every requirement and success criterion has at least one passing, tagged test, checked by a trace command (tags `covers-obs:`).

## Assumptions

- ADR-001 and its 2026-11-27 amendment are accepted; changes to the decisions go to the ADR first.
- Whether every kind of engine change moves a stats counter is not known; it is a question to put to the engine's maintainers. Until answered, the documentation states the rule and its limit, and no requirement here claims the property.
- Out of scope, and decided separately: a read-only open mode (relatedb/relate-contrib#22), a low-priority statement lane (#23), a development-only registry of clients (#25), and any change to when subscriptions re-run.
- Applies to the core package only; adapters and libraries build on the core and need no change.
- The engine version is known to the worker once it loads the engine; if the engine does not report one, the description says so rather than guessing.
- Minimum supported engine is the workspace's supported engine (1.3.0 to 1.4.x).
