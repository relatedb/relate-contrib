---
id: SPIKE-003
title: Instance Lifetime Across Navigation in Astro
status: done
rfcs: [RFC-001]
created: 2026-11-01
---

# SPIKE-003: Instance Lifetime Across Navigation in Astro

## 1. Question

On an Astro site that uses client-side routing, can one browser Relate instance stay alive across page changes, and what does each lifetime option cost and require?

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

## 4. Notes

- 2026-11-01, step 0. Astro 7.4.4 ships the same router API this spike was written against: the `ClientRouter` component (imported from `astro:transitions`), the `transition:persist` directive (the router moves the marked element into the new page's body instead of replacing it), and the events `astro:before-preparation`, `astro:after-preparation`, `astro:before-swap`, `astro:after-swap` and `astro:page-load`. Checked in the installed package's sources. A persisted island is not remounted, so it has to notice the new page itself.
- 2026-11-01, setup. The site is a copy of SPIKE-002's `astro-graph` in this spike's own directory (`astro-nav/`), plus `@astrojs/react` for a component island that renders on the server and again in the browser. Six lifetimes live under one route, `/life/<mode>/<n>/` (see the README).
- 2026-11-01, `fetch()` inside a SharedWorker failed in the embedded browser used for the measurements, for every URL including `/`. The same fetches in a dedicated worker returned 200. Not diagnosed further. The shared worker was changed so the first page to connect fetches the `.wasm` bytes and the graph and sends them over the port; later pages send nothing. This is untested in other browsers and could be an artifact of the embedded browser.
- 2026-11-01, the embedded browser sometimes stalled a client-side navigation after the router had fetched the next page and before it swapped it in (`before-swap` never fired; the next click released it). It happened when the page was visible but not being rendered. Client-side timings below come from runs where navigations completed normally. They are single sequences, not repeated runs.

## 5. Findings

All browser figures are from a production build (`astro build`, `astro preview`) in the embedded browser, with the browser's own timers; one sequence of navigations per cell, so treat differences under about 2× as noise. "Ready" is time from the start of navigation until the first query result is displayed.

### 5.1 Lifetimes across navigation (RFC-001 §5.2 "how long it lives", §7.3, §7.6)

Synthetic site of 1,000 pages and 5,000 links:

| lifetime | first load, ready | each later navigation, ready | instance across navigations |
|---|---|---|---|
| new instance per page load (multi-page site, no router) | 295–484 ms (replay 234–403) | 295–484 ms, paid on every page | new each time |
| new instance per client-side navigation | 137 ms (replay 98) | 113–128 ms (replay 92–101) | new each time |
| main-thread singleton, client-side routing | 545 ms (replay 400, first load of the session) | 16–25 ms | one |
| singleton plus `transition:persist` island | 126 ms | 14–27 ms | one |
| shared worker, client-side routing | 219 ms | 24–25 ms (one outlier at 167) | one |
| shared worker, multi-page site, one tab | 504–570 ms (replay 418–474) | 503–570 ms, every page | **new each time** |
| shared worker, multi-page site, a second tab open | | 40–43 ms | one, shared by both tabs |

At 5,000 pages and 25,000 links:

| lifetime | first load, ready | each later navigation, ready |
|---|---|---|
| new instance per client-side navigation | 856 ms | 1,331 and 1,454 ms |
| main-thread singleton | 842 ms | 21–23 ms |

- One instance survives client-side navigation with either a module-level singleton or a persisted island. Module state outlives route changes; the router does not reload the page. In this spike per-page work hung off the island's mount and `astro:page-load`, and module-level state persisted.
- Re-initializing on every navigation re-pays the replay each time. Re-initialization was slower than the first load at 5,000 pages (about 1.3–1.4 s against 0.86 s). Not explained.
- A shared worker gives no persistence on a multi-page site with a single tab. The worker ends when its last connected page goes away, and navigation closes the old page before the new one connects: five navigations produced five worker instances, each replaying the graph. It persists only while another page stays connected (second tab: 40–43 ms per navigation).
- A fresh page load costs more than a repeated replay in the same page (234–403 ms against 92–101 ms for the same 1,000 pages); the first load of a session was the slowest (about 400–480 ms). The browser-side explanation was not investigated.

### 5.2 Per-page overlay (§7.4)

Run in Node against the same WASM module (`scripts/overlay.mjs`, `results/overlay.json`): 50 note nodes tagged with a page scope and 50 relationships to site pages, added on arrival and removed with `MATCH (n:Note {scope: $scope}) DETACH DELETE n` on departure. Repeated for 100 arrivals and departures on 1,000 and 5,000 pages.

- **Removal is exact.** After each departure the page, link, note and overlay-relationship counts return to their starting values, and the site graph is unchanged. In the browser the notes count was 50 on every arrival, for the singleton, persisted and shared-worker modes, so each departure dropped the previous page's notes.
- **Cost:** dropping the overlay takes under 1 ms regardless of graph size. Adding it takes 3–5 ms with an index on `Page.id` and on the note scope, and 32 ms (1,000 pages) to 160 ms (5,000 pages) with both indexes absent. The cost grows with the page count, which fits a scan of the pages for every note that refers to one; the two indexes were not removed separately.
- **Memory:** WASM memory grew once (31.1 to 35.6 MB for 1,000 pages) and stayed flat across the remaining cycles.
- **A separate instance per page is also cheap:** about 0.01 ms to create, 0.5 ms to load the page's 50 notes, 0.03 ms to free, with no memory growth over 100 cycles. It cannot be queried together with the site graph.
- **Scope keys must identify the view, not the page.** With two tabs on the same page, both write the scope `page-n`, so one tab's departure removes the other's notes. Not run as an experiment, but follows directly from the scope being the only key. Tabs on different pages coexisted correctly (100 notes with two tabs open).
- In multi-page modes the departure must be triggered from `pagehide`, since nothing else runs. With that handler, no notes leaked across multi-page navigations.

### 5.3 Hydration and failure behavior (§7.10)

- A component that renders on the server and again in the browser agreed with the server output on a full page load and on every client-side navigation when its first render did not depend on the instance (placeholder text first, result after the instance answered). No error events across swaps.
- A component that read the instance's answer during render (the "naive" variant) produced React error #418 (text content mismatch) on the first client-side navigation after the singleton had become ready, then recovered by re-rendering on the client. The same component rendered correctly on a full page load, because no instance was ready yet. In singleton and worker modes, an instance that outlives the page makes the first client render differ from the server render.
- Before the instance was ready, the server-rendered page already contained the navigation and content links plus the placeholder. With the graph URL pointing at a missing file the panel showed "Graph unavailable: <reason>" and the links stayed in the page. Client-side navigation is a router feature and does not depend on the database.
- A failed first load in the shared worker can be retried: the worker clears its stored promise on failure. Without that, every later connection would receive the same rejection.

### 5.4 Shared worker support and failure modes (§7.6)

- **Last connection closing:** the worker and its instance end (see 5.1). Reconnecting means a new instance and a new replay.
- **Identity:** two different worker names produced two separate instances, each replaying the graph. A deploy that changes the worker's script URL would do the same, so tabs on old and new builds do not share an instance (not tested with an actual redeploy).
- **Binary delivery:** the first page sends the `.wasm` bytes and the graph; later pages send nothing. Fetching from inside the worker did not work in the embedded browser (see Notes).
- **Bundling:** the worker bundle contained a second copy of the 5,973,771-byte `.wasm` (probably from the glue's default lookup; it was not used at run time here), so the build output carries two copies.
- **Browser support** was not checked.

### 5.5 What an adapter has to do on swap events

- Run arrival work on `astro:page-load` (it fires on the first load and after every swap), not at module load.
- Run departure work (drop the page's overlay, free a per-navigation instance) when the island unmounts, on `astro:before-swap` for a persisted island, and on `pagehide` for multi-page navigation.
- Keep a persisted island's page state in sync itself: the router does not remount it or update its props.
- Keep instance state out of the first render.
- Key page-scoped data by view, not by page.

## 6. Conclusion

- **§7.6.** A shared worker does not give one instance across the pages of a single visitor's multi-page navigation, because it ends between pages. Where client-side routing is available, a main-thread singleton or a persisted island keeps one instance across navigation at about 20 ms per navigation, with no shared worker. A shared worker only pays off when several tabs are open at once.
- **§7.4.** An overlay on the shared instance works: removing a page's data is exact and takes under 1 ms, and adding it takes a few milliseconds when the lookup properties are indexed. Separate per-page instances are also cheap but cannot be queried together with the site graph. The overlay is the viable default; scope keys must identify the view.
- **§7.10.** Hydration agrees when the first render does not depend on the instance. A component that does depend on it mismatches once the instance outlives the page. Pages stay usable before the database is ready and when it fails, because navigation does not depend on it.
- **§7.3.** Replay cost is a per-page cost only where the instance does not outlive the page: a multi-page site pays it on every page (about 0.3–0.5 s for 1,000 pages), while client-side routing with one instance pays it once.

Paste-ready wording for RFC-001:

> 7.6 (answer, SPIKE-003): in a multi-page site visited in one tab, a shared worker ends between pages, so each page replays the graph again; it keeps an instance only while another page stays connected. With client-side routing, a main-thread singleton or a persisted island keeps one instance across navigation (about 20 ms per navigation, against 0.1 to 1.4 s when re-initialized). Remaining question: whether a worker owned by the persisting page, rather than a shared worker, gives both the persistence and the main-thread relief (see 7.3).
>
> 7.4 (answer, SPIKE-003): one instance can hold page-scoped data over the site graph. Removal on departure is exact and takes under 1 ms; adding takes a few milliseconds when the lookup properties are indexed. Page data must be keyed by view, not by page, when several tabs can show the same page.
>
> 7.10 (partial answer, SPIKE-003): a component that reads the instance during its first render mismatches the server output once the instance outlives the page (client-side routing); a component that renders a placeholder first and the result after the instance answers does not. Pages remained usable before the database was ready and when loading failed. Not yet tested: other frameworks' hydration, and a hydration mismatch's effect on user-visible state beyond text.

Gaps for SPIKE-004: whether a dedicated worker owned by the persisting page removes the main-thread block at 1,000 to 5,000 pages (7.3) and how a trapped instance is replaced (7.2); shared worker fetch behavior and browser support in other browsers; repeated measurements of the figures above.
