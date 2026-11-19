# Feature Specification: The relate-phaser Package, Extracted from the Path Explorer

**Feature Branch**: `spec/009-relate-phaser-package` (spec directory `009-relate-phaser-package`)

**Created**: 2026-11-18

**Derived From**: ADR-012 (design/adr/ADR-012-relate-phaser-boundary.md)

**Status**: Implemented

**Input**: User description: "Implement ADR-012 (the boundary and public interface of @relate/contrib-phaser, packages/phaser): a workspace package, versioned below 1.0, with a statement queue, a generic reply cache, a throwaway in-memory client and a Phaser scene helper. The demo is changed to consume the package so its existing tests exercise the extraction. Parents: RFC-008, RFC-005."

## Overview

A Phaser game redraws about sixty times a second and cannot wait for anything. The engine that holds its world runs in a Web Worker and answers every statement asynchronously. Every graph-backed Phaser game therefore needs the same few pieces: a queue that sends statements to the engine in order without the frame loop awaiting, a store the frame loop can read at any moment and the engine's replies keep current, a way to recover when the engine is replaced, and a throwaway graph for attract modes and sandboxes. The path explorer demo (`demos/phaser-path-explorer`, ADR-011) contains these pieces, written against its own types.

This feature builds one package from ADR-012:

- **The package** `@relate/contrib-phaser` (`packages/phaser`): a statement queue, a generic reply cache, a throwaway client and a Phaser scene helper, versioned below 1.0 and documented as unstable.
- **The demo's adoption**: the path explorer is changed to use the package, so its existing tests are the first test of the extraction, and it gains correct behaviour after an engine replacement.

Three kinds of people depend on it:

- **Hackathon participants and game authors** want a tested starting point for keeping game state in the embedded graph, without rewriting the queue's ordering and error behaviour.
- **Players of a game built on it** want the game to keep running smoothly while the engine works, and to recover when the engine is replaced.
- **Maintainers of this repository** want the package checked with the rest of the workspace and every requirement covered by a tagged test.

Terms: the *queue* sends statements one at a time, in order; the *cache* is the store the frame loop reads; an *action* is one change a player makes that needs a statement; a *generation* is the core's count of engine instances (it increases each time a failed instance is replaced).

The specification implements ADR-012 and does not restate its decisions where an ADR section carries them; the requirements name the section. It builds on ADR-001 (the client's status and replacement of a failed instance), ADR-009 (application graphs, which reopen the same store after a replacement) and ADR-011 (the first consumer). ADR-012 is accepted.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Statements go to the engine in order without the frame loop waiting (Priority: P1)

A game author creates a queue over a core client, pushes statements from the frame loop and from input handlers, and receives a promise of rows for each. The frame loop never awaits. Statements apply in the order pushed. A rejection tells the author whether the engine refused the statement or the client could not run it.

**Why this priority**: it is the part where mistakes are subtle and every consumer needs it.

**Independent Test**: build a queue over a client holding a small graph, push several statements including writes that depend on order, and compare results and final graph state with the expected order; repeat with an engine error and with a client fault.

**Acceptance Scenarios**:

1. **Given** statements A, B and C pushed in that order without awaiting, **When** they run, **Then** the engine applies them in that order, one at a time.
2. **Given** a statement the engine refuses, **When** its promise settles, **Then** it rejects with a `StatementError` carrying the engine's message, and later statements still run.
3. **Given** the client rejects a call with `lost`, `timeout` or `failed`, **When** the promise settles, **Then** it rejects with the client's `GraphError`, and `reason` is available to the game.
4. **Given** statements queued or in flight, **When** the game reads `pending`, **Then** it equals their number; **When** the queue empties, **Then** `idle()` resolves and every `onSettle` listener is called once.
5. **Given** the queue built from a client with `Bridge.forClient`, **When** it runs, **Then** it behaves as one built from the equivalent query function.
6. **Given** a statement queued while another is in flight, **When** the first resolves, **Then** the second starts after it and not before.

---

### User Story 2 - A cache the frame loop reads and replies keep current (Priority: P1)

A game author defines the shape of its state, creates a reply cache over it, and reads the state in every frame. Actions apply an optimistic change at once, queue a statement and commit the reply's patch; a rejection rolls the change back. After the engine is replaced, the cache reloads from the restored graph. The cache follows the client's status so the game can show a fault screen.

**Why this priority**: the cache carries the pending marker, the rollback and the reload, which a copied demo would get wrong.

**Independent Test**: build a cache over a trivial state and a client holding a small graph; run actions, force a rejection and simulate a new generation; check the state, version and status at each step.

**Acceptance Scenarios**:

1. **Given** a commit, **When** it applies, **Then** the version increases by one and the state reflects the change.
2. **Given** an action with an optimistic change, **When** it is started, **Then** the state shows the change at once, and `pending` holds the action's key until its reply is committed.
3. **Given** an action awaiting its reply, **When** a further action is started, **Then** it queues behind the first and its optimistic change is applied when its turn comes, not before.
4. **Given** an action whose statement is rejected, **When** the rejection arrives, **Then** the optimistic change is rolled back, the error is returned to the caller, nothing is thrown into the frame loop, and the version reflects the rollback.
5. **Given** the client replaces its instance (a new generation), **When** the new instance is ready, **Then** the cache runs the game's read statements again and commits the result in one step; an action whose statement was rejected with `lost` is rolled back and not repeated.
6. **Given** a reload that is rejected, **When** the cache settles, **Then** the previous state is kept and `status` is the one the client reports (`recovering` or `failed`), not an empty state.
7. **Given** the client's status changes, **When** the event arrives, **Then** `cache.status` follows it, starting from the client's status at construction.
8. **Given** the status is `failed`, **When** an action is started, **Then** it rejects at once with `GraphError` reason `failed` and nothing is queued.

---

### User Story 3 - The path explorer runs on the package (Priority: P1)

The demo's own queue and its generic cache mechanism are removed and replaced by the package. Its game logic (statements, scoring, robots, drawing, undo) is unchanged.

**Why this priority**: it proves the extraction in place, and it is the first consumer.

**Independent Test**: run the demo's unit tests and its browser run against the changed demo, and compare with the 202 unit tests that pass before the change (the queue's own four move to the package).

**Acceptance Scenarios**:

1. **Given** the demo built on the package, **When** its unit tests run, **Then** all of the tests that passed before still pass, except the queue's own, which move to the package.
2. **Given** the real game and the splash's demo world, **When** each is started, **Then** each uses a queue and a cache from the package, and the demo world uses a throwaway client.
3. **Given** the engine is replaced during play, **When** the new instance is ready, **Then** the board is rebuilt from the restored graph before the next frame that reads it.
4. **Given** the demo's source, **When** it is searched for the queue's old location, **Then** no copy of the queue remains in it.

---

### User Story 4 - A throwaway graph that never touches saved data (Priority: P2)

A game author starts a second graph from a seed document, for an attract mode, a tutorial or a sandbox, and nothing about it is kept.

**Why this priority**: the splash's demo world needs it now, and it is the one multi-graph case the package covers.

**Independent Test**: create a throwaway client beside an application-graph client, change both, reload, and check that only the application graph kept its data.

**Acceptance Scenarios**:

1. **Given** a seed document, **When** `createThrowawayClient` is called, **Then** it returns an ordinary client over an in-memory graph with no store behind it.
2. **Given** options that include an `application`, **When** it is called, **Then** it rejects them (it never opens a store).
3. **Given** a throwaway graph and a saved game running together, **When** the page is reloaded, **Then** the saved game's data is unchanged and the throwaway's is gone.

---

### User Story 5 - A Phaser scene redraws only when something changed (Priority: P2)

A game author gives a scene, a cache and a redraw function. The helper calls the function from the scene's update only when the cache's version has changed since its last call.

**Why this priority**: it is the one Phaser-specific part, and it keeps the frame loop cheap.

**Independent Test**: drive a scene's update many times with and without commits, and count the redraws.

**Acceptance Scenarios**:

1. **Given** no commit between two updates, **When** the second runs, **Then** the redraw function is not called.
2. **Given** one commit between two updates, **When** the second runs, **Then** the redraw function is called once.
3. **Given** several commits between two updates, **When** the next update runs, **Then** it is called once.
4. **Given** the scene is shut down, **When** the helper is released, **Then** it stops calling the redraw function.

---

### User Story 6 - The package installs cleanly and is checked with the rest (Priority: P2)

A game author installs the package into an empty project with the core and Phaser, and it works. Maintainers run its checks like those of the other packages.

**Why this priority**: an unpublishable or untested package is not delivered.

**Independent Test**: pack the package, install it in a clean project, build and run a small page, and run the trace check.

**Acceptance Scenarios**:

1. **Given** the packed package and a clean project with `@relate/contrib-web` and `phaser`, **When** a small page creates a queue and a cache and runs an action, **Then** it works and the build passes.
2. **Given** the repository, **When** the package's check commands run, **Then** unit, package and trace checks pass and are listed in the project's guidance.
3. **Given** the requirements below, **When** the trace check runs, **Then** every requirement and success criterion has a passing, tagged test.
4. **Given** the package's manifest, **When** it is read, **Then** the version is below 1.0, and `@relate/contrib-web` and `phaser` are peer dependencies that the package does not bundle.

---

### User Story 7 - The documentation says what the package does not do (Priority: P3)

The README leads with the problem (a frame loop in front of an asynchronous engine), shows the four pieces, and states what stays in the game: statements, partial reads, seeding and drawing.

**Why this priority**: the boundary is the design, and a reader needs it to use the package well.

**Independent Test**: read the README alone and list what the package provides and what it leaves to the game.

**Acceptance Scenarios**:

1. **Given** the README, **When** a reader looks for reading only what is needed (revealed tiles, visited dialogue branches), **Then** it is described as a pattern with the path explorer as the reference, and the package does not enforce it.
2. **Given** the README, **When** a reader looks for the package's limits, **Then** it says the interface is unstable below 1.0, that it is sized for turn-sized actions, and that several graphs per game are left open.

### Edge Cases

- Statements pushed while the client is `loading` or `recovering`: they wait for the client (the core holds calls until ready), and the cache's `pending` reflects them.
- A statement in flight when the instance is replaced: it rejects with `lost`; the cache rolls back its optimistic change and does not repeat it.
- An action started while a reload is running: it queues behind the reload.
- A `commit` whose patch throws: the version does not change and the error reaches the caller (patches should fail before they mutate).
- Two caches over one client: each follows the client independently.
- A listener that throws in `onSettle` or a status handler: it does not stop the queue or other listeners.
- The scene helper used with a cache whose version never changes: it never calls the redraw function.
- A client that is destroyed: pending statements reject with `lost`, and the cache stops following the client.

## Requirements *(mandatory)*

### Functional Requirements

**The package**

- **FR-001**: The package `@relate/contrib-phaser` MUST live in `packages/phaser`, MUST be versioned below 1.0, and MUST declare `@relate/contrib-web` and `phaser` as peer dependencies without bundling them or the engine's WebAssembly package (ADR-012 2.1).
- **FR-002**: The package MUST ship no statement text, no seeding, no hex drawing and nothing that knows a game's rules (ADR-012 2.6).

**The queue**

- **FR-003**: `Bridge` MUST apply statements in the order enqueued, one at a time, and MUST NOT retry (ADR-012 2.2).
- **FR-004**: `Bridge.forClient(client)` MUST build a queue over a core client, and the form that takes a query function MUST remain.
- **FR-005**: A rejection from the client MUST surface as the client's `GraphError`, and an engine error in a reply MUST surface as a `StatementError` carrying the engine's message.
- **FR-006**: `pending`, `idle()` and `onSettle(listener)` MUST report the statements queued or in flight, resolve when the queue is empty, and call back when it becomes empty.

**The cache**

- **FR-007**: `ReplyCache<S>` MUST hold a game-defined state, a `version` bumped by every `commit`, and a `pending` key for the one action awaiting its reply (ADR-012 2.3).
- **FR-008**: `act` MUST apply an optional optimistic change at once, queue a statement, commit the game's patch on the reply, and on a rejection roll the change back and return the error to the caller. A further action MUST queue behind a pending one.
- **FR-009**: `reload` MUST run the game's read statements through the queue and commit the result in one step; the cache MUST call it at start-up and after every new client generation (ADR-012 2.5).
- **FR-010**: A rejected reload MUST leave the previous state in place; an action rejected with `lost` MUST be rolled back and not repeated.
- **FR-011**: `cache.status` MUST start from the client's status and follow the client's `status` event; while it is `failed`, `act` MUST reject at once with `GraphError` reason `failed` and queue nothing.
- **FR-012**: The cache MUST NOT contain undo, snapshots across several actions, knowledge states or statements; these stay in the game.

**The throwaway client and the scene helper**

- **FR-013**: `createThrowawayClient(options, document)` MUST return a client over an in-memory graph given as data, with no descriptor and no store, and MUST reject options that include an `application` (ADR-012 2.4).
- **FR-014**: `watchCache(scene, cache, redraw)` MUST call `redraw` from the scene's update only when the cache's version has changed since its last call, and MUST stop when the scene shuts down.

**The demo and the checks**

- **FR-015**: The path explorer MUST use the package's queue and cache, and its throwaway world MUST use `createThrowawayClient`; its own copy of the queue MUST be removed (ADR-012 2.7).
- **FR-016**: The demo MUST rebuild its board after a new client generation, and every unit test that passed before the change MUST still pass.
- **FR-017**: The package MUST have unit tests against the real engine in Node, a package check that installs the packed package in a clean project, and a trace check mapping every requirement and success criterion to a passing, tagged test (tags `covers-ph:`); the commands MUST be added to the project's guidance.
- **FR-018**: The package's README MUST describe the four pieces, what stays in the game, the partial-read pattern with the demo as reference, and the limits of the first release (ADR-012 2.6, 4).

### Key Entities

- **Queue (`Bridge`)**: the ordered, one-at-a-time channel to the engine, with a pending count and settle notification.
- **Cache (`ReplyCache<S>`)**: the store the frame loop reads: the game's state, a version, the pending key and the status.
- **Action**: one change that needs a statement, with an optional optimistic part, a patch from the reply, and a rollback.
- **Throwaway client**: a client over an in-memory graph given as data.
- **Statement error**: an engine refusal, distinct from a client fault.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: In a run of 1,000 statements pushed without awaiting, 100 % apply in the order pushed.
- **SC-002**: After a forced engine replacement during play, the board is rebuilt from the restored graph with no reload by the player, and no action is applied twice.
- **SC-003**: Every unit test of the path explorer that passes before the change passes after it (202 before; the queue's own four have moved to the package), with no copy of the queue left in the demo.
- **SC-004**: A game author can go from a clean project to a first action through the cache in under 15 minutes using the README alone.
- **SC-005**: In a scene driven for 600 updates with commits on 5 of them, the redraw function is called 5 times.
- **SC-006**: A throwaway graph and an application graph running together keep 100 % of the application graph's data across a reload and none of the throwaway's.
- **SC-007**: Every requirement and success criterion has at least one passing, tagged test, checked by the trace command.

## Assumptions

- ADR-012 is accepted (2026-11-18). Amendments go to the ADR first.
- The core web package needs no change. If the `status` event or `onGeneration` prove insufficient, that is raised as an ADR amendment before any core change.
- The first release is sized for turn-sized actions (ADR-012 4); batching or write coalescing is open (RFC-008 7.6) and out of scope.
- Several graphs per game beyond the throwaway client are open (RFC-008 7.5) and out of scope.
- The hex-map toolkit stays in the demo as demo code (RFC-008 5.5).
- The package is built and tested with the workspace's existing tooling (pnpm, Vitest, Playwright), like the other packages; Phaser's version is the demo's (4.x).
- The scene helper is tested with a minimal scene double in Node and in one browser run, not a full game.
