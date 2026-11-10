# ADRs — Architecture Decision Records

ADRs capture the technical **HOW** for one architecturally-significant decision — the Develop
half of the double-diamond design process described in the project's
[CLAUDE.md](../../CLAUDE.md). Every ADR requires at least one existing parent
[RFC](../rfc/README.md) — usually one, but an ADR MAY serve more than one RFC when a decision is
genuinely shared infrastructure (e.g. a snapshot format that several framework integrations
depend on); an ADR never writes implementation code itself.

## Audience

Same reader as the [RFCs](../rfc/README.md#audience): technically fluent, comfortable with
graph databases and web frameworks as general ideas, and new to this project's specifics. An ADR necessarily
carries more of those specifics than an RFC — so name each one on first use ("site graph" is the
shared build-time graph of a website's pages; "snapshot" is its serialized form) rather than writing as
though the reader has already been through the pipeline.

Context should open on the technical forces, not on the paperwork: what situation makes a decision
necessary, before any parent-RFC citation. `/adr-review` criterion 8 checks this, and
`adr-create`'s "Voice and audience" section holds the rules.

## When to write an ADR

- A parent RFC has settled the problem/direction and a specific technical decision now needs to
  be made and recorded before implementation.
- The decision is concrete enough to implement from.
- If a decision would genuinely serve more than one RFC, list all of them as parents rather than
  picking one arbitrarily and mentioning the rest only in prose — an unlisted relationship doesn't
  show up in the index tables.

## Format

Created/updated via `/adr-create`. File: `design/adr/ADR-NNN-short-title.md`, `NNN` zero-padded.

**Front-matter** (YAML):

| Field | Description |
|---|---|
| `id` | `ADR-NNN` |
| `title` | Short descriptive title |
| `status` | `proposed` \| `accepted` \| `rejected` \| `superseded` |
| `rfcs` | Parent RFC id(s), a list — **required, at least one**, set at creation, only ever grows (never hand-remove an entry) |
| `created` | ISO date (`YYYY-MM-DD`) |

**Required sections** (numbered `##`, renumber if one is omitted) — `status` lives only in
front-matter, no matching body section:

1. Context
2. Decision — split into numbered `###` subsections (`2.1`, `2.2`, ...) when the decision has
   more than one genuinely distinct facet (e.g. format, location, seeding plan)
3. Alternatives Considered
4. Consequences
5. Related — RFC link(s)

Use `/adr-review` before moving a draft to `accepted`.

## Index

| ADR | Title | Status | RFCs |
|---|---|---|---|
| [ADR-001](ADR-001-worker-hosting-profiles.md) | Dedicated-Worker Hosting with Two Navigation Profiles | accepted (amended 2026-11-02) | RFC-001 |
| [ADR-002](ADR-002-graph-data-format.md) | Node-Link JSON as the Graph Data Format | accepted (amended 2026-11-02) | RFC-001, RFC-002 |
| [ADR-003](ADR-003-graph-descriptor.md) | Graph Descriptor Beside the Graph Data | accepted (amended 2026-11-10) | RFC-001 |
| [ADR-004](ADR-004-astro-adapter.md) | The Astro Adapter as an Integration over the Core | accepted (amended 2026-11-05) | RFC-001, RFC-002 |
| [ADR-005](ADR-005-next-adapter.md) | The Next.js Adapter as React Bindings over the Core | accepted (amended 2026-11-05) | RFC-001, RFC-002 |
| [ADR-006](ADR-006-observable-adapter.md) | The Observable Framework Adapter as a Helper Package over the Core | accepted (amended 2026-11-08) | RFC-001, RFC-002 |
| [ADR-007](ADR-007-sveltekit-adapter.md) | The SvelteKit Adapter as Svelte 5 Helpers over the Core | accepted (amended 2026-11-08) | RFC-001, RFC-002 |
| [ADR-008](ADR-008-react-admin-provider.md) | A react-admin Data Provider over the Core, with a Local-First Starter | accepted (amended 2026-11-10) | RFC-005, RFC-006 |
| [ADR-009](ADR-009-application-graphs-in-the-core.md) | Application Graphs in the Core as a Named Durable Store with Schema Versions | accepted (amended 2026-11-10) | RFC-006, RFC-001 |
| [ADR-010](ADR-010-graph-catalog-file.md) | A Catalog File Beside the Stores, Ordered by a Web Lock | accepted | RFC-007 |

Package names: on 2026-11-05 the core and the Astro adapter were renamed from `related-web-core` and `related-web-astro` to `@relate/web-core` and `@relate/web-astro`, joining `@relate/web-next`. The ADRs use the new names throughout; the decisions are unchanged. On 2026-11-08 the project became `relate-contrib` and the packages `@relate/web`, `@relate/astro` and `@relate/nextjs`; the same holds for the decisions and the text of the ADRs (see `design/notes/2026-11-08-relate-contrib-rename.md`).
