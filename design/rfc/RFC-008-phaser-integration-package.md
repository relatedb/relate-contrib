---
id: RFC-008
title: A Shared Package for Using the Engine from Phaser Games
status: draft
created: 2026-11-18
adrs: [ADR-012]
---

# RFC-008: A Shared Package for Using the Engine from Phaser Games

## 1. Summary

RelateDB is an embedded property graph engine that runs in the browser, in a Web Worker, and answers queries asynchronously. Phaser is a browser game framework built around a frame loop that runs about sixty times a second and cannot wait for anything. A game that keeps its world in a graph has to join the two: the frame loop must read a picture of the world that is always available, while the engine answers questions at its own pace.

Joining them well takes four things that no particular game owns: a way to send statements to the engine in order without the frame loop ever waiting; a local picture of the world that the engine's replies keep up to date; a way to put a world into a graph once and later read back only the part the game needs, such as the part a player has discovered or the dialogue branches already visited; and a throwaway in-memory graph for attract modes, tutorials and sandboxes that must not touch saved data. A first game, the path explorer, has all four. This RFC proposes extracting them into a published package inside this repository, so that a second Phaser project starts from them rather than rewriting them. It settles the scope of that package, where it lives, and when it would move to a repository of its own. Technical decisions are left to ADRs.

## 2. Problem / Motivation

The path explorer demo is a Phaser game whose entire world, rules and score live in a graph. About 3,500 lines of it are game code, but a core of that code is not about paths, robots or hexes: it is the machinery any graph-backed Phaser game needs.

- A queue that runs statements strictly one at a time, in order, and resolves a promise for each caller, while a counter of statements in flight lets the game show a "thinking" indicator. The frame loop pushes work onto it and never awaits.
- A plain-object cache of the world "as the player may know it", patched by replies. Rendering reads only this object. An action that needs a reply to know what it revealed shows as pending until the reply arrives, and a further action waits for it.
- A seed document written to the application graph (a durable graph in the visitor's browser that a site's pages share) on first run, and reads that return only what is needed. In the demo that is what the player has revealed: the client never holds the ground truth of a tile the player has not discovered, which makes fog of war real rather than cosmetic. The same pattern fits a dialogue tree that loads only visited branches.
- A throwaway graph, built from a seed document with no store behind it, that runs the attract mode behind the title screen without touching the saved game.

These parts are written against the demo's own types, but nothing in their design depends on hexes. RFC-005 (community integrations) expects shared libraries to be extracted from demos and asks what triggers an extraction (its question 7.3). This RFC answers it for the first library: a working demo is enough, and a second consumer is what marks the interface stable (5.4). Games are the likeliest source of hackathon projects that want to start from something, and a Phaser project that begins today copies the demo and must work out which parts are generic. Every such copy drifts from the others, and fixes to the ordering and error behaviour of the queue (the part where mistakes are subtle) reach none of them.

A related cost is the packaging question: where this shared code should live. The engine is a heavy prerequisite (a Rust-built WebAssembly module in a vendored submodule), and the existing workspace already publishes several independent packages. Choosing a home is part of the problem, because it shapes how releases, tests and design records are managed.

## 3. Goals

- Give a Phaser project a small, tested set of building blocks for keeping game state in the embedded graph, with the frame loop never waiting on the engine.
- Document the pattern of reading only what is needed (reveal-only reads are one case) with the demo as its reference, so a game with hidden or large state can follow it.
- Make an in-memory throwaway graph a first-class, documented way to run attract modes, tutorials and sandboxes beside a saved game.
- Prove the package by having the path explorer consume it, so the demo exercises the extraction.
- Publish the package independently, under its own name and version, from this repository.

## 4. Non-Goals

- A game framework. The package does not prescribe scenes, entities, scoring, turn structure or rendering.
- The hex-map toolkit in the demo (lattice, painting, sprites, fog and cloud drawing). It is not tied to the engine and is outside the organisation's scope; see 5.5.
- The splash and message-bubble overlay, which is generic interface code with no connection to the engine.
- Changes to the engine or to the core web package. The package builds on what the core already offers for application graphs (RFC-006) and the graph catalog (RFC-007).
- A server-backed kit, multiplayer, or any runtime other than the browser.

## 5. Proposed Approach (high-level)

### 5.1 What the package holds

The package holds the four capabilities in section 2 and nothing about any particular game. Each capability is useful alone: a project may take the queue without the cache, or the throwaway graph without either. What stays in the demo is everything that knows the game's rules: the statements, scoring, robots, signposts and drawing.

The boundary between generic and game-specific is the main design question. Some of the cache is clearly game-shaped (the player's knowledge states) while its mechanism (a locally held picture of the world that replies keep current, with pending actions) is general. The package should offer the mechanism and let the game supply the shape.

### 5.2 Where it lives

The package is added to this repository's workspace as `@relate/relate-phaser`, in the `packages/phaser` directory, with its own version and release, like the existing packages. It shares the `@relate` scope with the core and the adapters, and its name follows the engine's own WebAssembly package (`@relate/relate-wasm`). Living here is a practical choice: it depends on the core web package, which is developed here, so a change to the core and to the package can land together and be tested together. The test machinery, specification process and design records are here. The first consumer, the demo, is here, and proving the extraction in place costs one change rather than coordinated changes across two repositories.

### 5.3 When it moves out

The existing convention is that an integration moves to its own repository only when it needs its own release cadence. This RFC adds two further triggers: the programming interface has stayed stable across a second consumer, or outside contributors to the Phaser work should not need the engine's build prerequisites to take part. Moving later is inexpensive if the package keeps a clean boundary and its history can be carried across.

### 5.4 First release

The first release comes from the demo's extraction and is versioned below 1.0 with its interface documented as unstable. A second consumer is not a precondition for publishing; it is the condition for calling the interface stable, and so for the move described in 5.3.

### 5.5 The hex-map toolkit

The hex-map toolkit is a useful idea that does not belong to the RelateDB organisation: it has no dependence on the engine, and maintaining a general hex-map library is outside the organisation's scope. It stays in the demo as demo code. If it is worth sharing, it is a project for the community to publish and maintain, and the demo can depend on it then.

### 5.6 Cross-cutting concerns

- **Honesty about storage.** A game that keeps data the visitor wrote inherits the application-graph rules about durability and storage status, and the package should surface them.
- **Fault handling.** A trapped engine instance is unusable afterwards. The queue is where a game learns about it, so how faults reach the game is part of the package's contract.
- **Accessibility and motion.** Not a concern of the package itself, but the examples it ships should show the throwaway graph used for attract modes that respect reduced-motion preferences.

## 6. Alternatives Considered

- **A standalone repository now.** Rejected for now: the package would consume the core web package as a published dependency, so every core change would need a release before the package could use it; the specification and design-record process would be duplicated or dropped; and the interface is expected to change often while it has a single consumer.
- **Leaving the code in the demo.** Rejected: it keeps the copy-and-drift cost described in section 2 and gives no tested, documented starting point for a second project.
- **Extracting only documentation of the patterns.** Rejected: the ordering and error behaviour of the queue is the part most likely to be gotten subtly wrong, and prose does not carry tests.
- **Folding the building blocks into the core web package.** Rejected: they serve one kind of consumer, would add a dependency on a game framework to a package that currently has none, and would tie their release cadence to the core's.

## 7. Open Questions

7.1. Where is the line between the cache mechanism and a game's own state shape? How much structure can the package offer before it prescribes a game design? (ADR-012 2.3 answers it for the first release: the package holds the version, the pending action, rollback and reload; the game holds the state shape and the patches.)

7.2. Which of the four capabilities does a typical hackathon project actually need first? The answer may argue for releasing the queue alone before the rest.

7.3. How are statements expressed: left entirely to the game, or does the package offer helpers for common shapes such as reveal-only reads and undo? (ADR-012 2.6: left to the game.)

7.4. How are faults, including a trapped engine, reported to a running game, and what does the package expect the game to do about them? (ADR-012 2.5: the core's replacement plus a reload; the cache follows the client's status.)

7.5. How does a game keep more than one graph: levels in sequence, save slots that last, or several boards live at once? The core already offers named application graphs, a catalog of them, and scopes within one graph, and a second client is a second worker. Should the package wrap one of these as a "world slot", and how strictly are scopes isolated, which matters for the reveal-only guarantee? The throwaway graph is the first case of a second graph beside the first; a second consumer would show which others are common.

7.6. Does the package serve high-volume writes, such as an entity-component system whose systems change many components a frame, or only turn-sized actions? The queue applies one statement at a time with a worker round trip each, so volume would need batching or write coalescing, and the throughput of the queue has not been measured. A non-spatial second consumer, such as a small dialogue-tree demo, would test the boundary from a direction the hex demo cannot.

## 8. ADRs

- ADR-012: the boundary and public interface of the package
