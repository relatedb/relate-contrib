---
id: SPIKE-005
title: Worker Survival Across Route Changes in Astro
status: in-progress
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
