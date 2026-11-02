---
id: SPIKE-005
title: Worker Survival Across Route Changes in Astro
status: done
rfcs: [RFC-001]
created: 2026-11-02
---

# SPIKE-005: Worker Survival Across Route Changes in Astro

## 1. Question

On a site that uses client-side routing, does a worker client held in module state keep the same worker and the same instance across route changes, and does a client inside an island kept with `transition:persist` do the same? What ends the worker, and what must an adapter do on the router's swap events?

Parent open questions and gates:

- RFC-001 §7.6: does the handle survive swaps as the main-thread singleton did?
- ADR-001 §4, the acceptance gate: the worker handle surviving client-side route changes in a browser that renders the page.

Also observed:

- RFC-001 §7.10: do registered queries (subscriptions) survive swaps?
- The cost of page-scoped writes against an open store, listed as unverified in ADR-001.

## 2. Method

SPIKE-003 and SPIKE-004 could not observe route swaps: the embedded browser did not render the page, and the router waits for a view transition before swapping.

0. **Read the router first (first hour).** In the installed Astro, find how the swap is scheduled and how to make it independent of rendering, for example by removing `document.startViewTransition` so the router takes its no-animation fallback. Record exactly what the harness changes. Check whether a browser that renders is available; if so, run the real path too.
1. **Set up.** Copy SPIKE-004's `astro-worker` into this spike's directory as `astro-survival`. Give the worker client an identity readable from the page: a worker id, a spawn count and the generation.
2. **Scenarios with the client in module state**, under client-side routing:
   - forward link clicks across several pages;
   - history back and forward;
   - programmatic navigation;
   - controls that must lose the worker: a link with `data-astro-reload`, and a full reload;
   - a navigation to a page that does not use the router;
   - a navigation while a query is in flight;
   - a navigation while the worker is still loading.
3. **The same scenarios** with the client inside an island kept with `transition:persist`, and with an island that remounts.
4. **Record** for each scenario whether the worker id, the generation and the registered subscriptions survive, and what the page must do on swap (arrival, departure, re-registration).
5. **If time remains,** time page-scoped writes (add and drop of scoped data) against an open store, compared with an in-memory instance.

## 3. Time-box

One working day. If no way is found to make swaps independent of rendering, record what was tried and report the gate as not met.

## 4. Notes

- 2026-11-02, step 0. In Astro 7.4.4 the router decides at module load whether the browser has `document.startViewTransition`. If it does, the route swap runs inside that call, and the browser calls the callback on the next frame. A page that is not being rendered gets no frame, so the swap never happens (observed: a click on a link did not swap within 6 s in the embedded browser, with the view-transition path). If it does not, the router runs its own simulation: with the fallback set to `swap` the DOM swap runs at once, with no animation to wait for.
- 2026-11-02, harness. `?vt=0` (kept in `sessionStorage`) runs an inline script in the head, before the router module, that defines `document.startViewTransition` as `undefined`; the layout sets `fallback="swap"`. Nothing else differs: the router still prepares the next page, runs its swap functions (including the handling of `transition:persist` elements), fires `astro:before-swap`, `astro:after-swap` and `astro:page-load`, and updates history. The document, its modules and its workers are untouched. Only the view-transition animation is removed.
- 2026-11-02, no rendering-capable browser was used. Claude in Chrome was not tried; the session's built-in browser was the only one used. The real view-transition path could not be observed.
- 2026-11-02, a first in-flight test used a 5,000 × 5,000 cartesian `count(*)` and the engine trapped with `unreachable` (observed once, time not recorded), so a plausible read-only statement, not only a thousand nested parentheses, can trap it. The in-flight test was redone on 1,000 pages, where the same statement takes about 2 s.
- 2026-11-02, a bug in the store-cost page: a restored store already has the index it created on the first visit, so creating it again fails with `IndexAlreadyExists`. The page now tolerates that.

## 5. Findings

Figures are single runs from the embedded browser on a production build, with the harness (`?vt=0`) unless stated.

### 5.1 The worker client in module state survives route changes (RFC-001 §7.6)

On pages 1 to 5 of the `module` variant (the client held in module state; the island remounts on each page), eight navigations: four forward link clicks, two history-back steps, one history-forward step and one programmatic `navigate()`.

- The document, the module, the client object and the worker were the same throughout (one worker id, generation 1, spawn count 1). No second worker was started.
- The page's own query was re-registered on each mount, and the unmount removed the previous one: the subscription count stayed at 2 (one registered at module scope, one for the current page), and the module-scope subscription kept its single registration.
- The island unmounted on every navigation (eight cleanup calls), so departure work can hang off unmounting.
- A navigation completed in about 24 ms.

### 5.2 A client inside a persisted island also survives

On the `persist` variant (the island with its own client, kept with `transition:persist`), seven navigations (four clicks, two backs, one forward): the same client, the same worker (one id), generation 1, spawn count 1, and the island never unmounted.

- The router does not remount a persisted island, so it re-registered its own query on `astro:page-load`; that event also fired on history back and forward, so the page text followed the address each time.
- The subscription count stayed at 1.

### 5.3 What ends the worker

- **A client created by an island that remounts** ended with the island: three navigations (two clicks and a back) produced three different workers, each with a new client, within one document.
- **A full reload** (a link with `data-astro-reload`) started a new document and a new worker.
- **A link to a page that does not use the router** was loaded as a new document, with a new worker.
- A new document can come from any of: a reload, a router-less page, and leaving the site. None can keep the worker.

### 5.4 Navigation during other work

- **Query in flight:** a 2.05 s statement (a two-way cartesian count over 1,000 pages) was running when the link was clicked. The page swapped after 24 ms and the query resolved normally with the right result, from the same worker. The new page's own result appeared after 1.93 s, because the worker runs one statement at a time.
- **Worker still loading:** with the 20,000-page graph (about 7 s to load), two navigations at 430 ms and 460 ms swapped at once and showed "loading…". The load continued without a second worker (spawn count 1), and the final page showed its result at 7.2 s. The components that had been left behind also finished their arrival work after they had gone, producing arrival records for pages the visitor had already left.

### 5.5 Page-scoped writes against an open store (ADR-001 gap)

Adding 50 notes and 50 relationships to site pages and dropping them, 30 cycles on a 1,000-page graph:

| instance | add (median) | drop (median) |
|---|---|---|
| in memory | 11.3 ms | 2.0 ms |
| store, first visit | 13.6 ms | 2.8 ms |
| store, restored | 13.6 ms | 2.7 ms |

- Writes against a store cost about 20% more for the add and 35–40% more for the drop, and stay in the range of 14 ms and 3 ms. No scoped data was left after the cycles.
- A restored store keeps its indexes.

## 6. Conclusion

- **§7.6 and the ADR-001 gate.** The worker client survived every route change tried, both in module state and inside a persisted island, with the same worker, generation and registered query. It was lost only when a new document was loaded, or when an island that created its own client was unmounted. The router never reloads the document, and the harness removes only the animation, so the result should carry to the view-transition path. It was not observed there, because no browser used here rendered the page. The ADR's gate says "in a browser that renders the page": either run the module scenario once in a rendering browser, or restate the gate as "with the router's simulated swap path, or in a rendering browser".
- **Adapter duties found:** keep the client in module state (or inside a persisted island), not inside an island that remounts; unsubscribe on unmount and re-register on arrival; for a persisted island, re-register on `astro:page-load`; ignore arrival work that finishes after the component has gone; expect a worker to run one statement at a time, so a running query delays the next page's first result.
- **Store writes.** Page-scoped writes against a store are cheap enough to use as designed (about 14 ms to add and 3 ms to drop for 50 notes and 50 relationships).

Paste-ready wording for RFC-001:

> 7.6 (answer, SPIKE-005): a dedicated-worker client held in module state, or inside an island kept with `transition:persist`, kept the same worker, generation and registered queries across eight and seven client-side navigations (link clicks, history back and forward, and a programmatic navigation); a swap took about 24 ms. A navigation while a 2 s query was running, or while a 20,000-page graph was still loading, did not start a second worker. The worker was lost only when the document was replaced (a reload, a link to a page without the router) or when an island that owned its client unmounted. Observed with the router's no-animation swap path in a browser that did not render the page; not yet observed with the browser's view transitions.

Gaps: a run in a browser that renders the page (the real view-transition path); the same check in Next, Nuxt and SvelteKit; whether a store opened by the worker stays open across swaps (not tested directly).
