---
id: SPIKE-003
title: Instance Lifetime Across Navigation in Astro
status: planned
rfcs: [RFC-001]
created: 2026-11-01
---

# SPIKE-003: Instance Lifetime Across Navigation in Astro

## 1. Question

On an Astro site that uses client-side routing, can one browser CypherLite instance stay alive across page changes, and what does each lifetime option cost and require?

Parent open questions in RFC-001:

- §7.6: does a shared worker, or an equivalent mechanism, give one instance across the pages of a multi-page site?
- §7.4: can an instance hold shared site data plus a page's own data and remove only the page's data on navigation, or are separate instances the only clean option?
- §7.10: what does an adapter need so that server-rendered and browser-rendered output agree, and so that the page works before the database is ready or when it fails to load?

Also observed: §7.3, the replay cost paid on each navigation (about 530 ms for 5,000 pages on the main thread, per SPIKE-002).

Out of scope: fault containment and dedicated-worker hosting (SPIKE-004), embeddings, and the navigation element.

## 2. Method

0. **Check the router API (first hour).** Read the current Astro documentation for the client-side router (`ClientRouter`), persisting an island across page swaps, and the swap lifecycle events. The API is recalled from memory and may have changed in Astro 7; record what is actually there.
1. **Enable client-side routing** on the SPIKE-002 Astro site, with the explore island present on several pages. Pages and links remain the only graph content.
2. **Compare three lifetimes:**
   - *Per page load:* the island re-initializes and replays the graph on each navigation. This is the baseline.
   - *Persisted:* a persisted island, or a module-level singleton, keeps one instance across swaps.
   - *Shared worker:* one instance serves several pages, including with client-side routing switched off.
3. **Per-page overlay.** On arrival at a page, add that page's own data to the shared graph; on departure, remove it. If removal is not possible or not cheap, fall back to separate instances for page and site and note what that costs.
4. **Hydration.** Add a component island that renders on the server and again in the browser. Observe whether the two outputs agree, what the page shows before the database is ready, and what it shows when loading fails.
5. **Measure and record.** Per-navigation cost for each lifetime (initialization, replay, first query), shared worker browser support and failure modes (last tab closing, version skew after a deploy), and what an adapter has to do on swap events.

## 3. Time-box

One working day. If step 0 shows the persisted-island route is unavailable, record that and spend the remaining time on the shared worker and overlay steps.
