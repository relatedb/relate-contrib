---
id: SPIKE-010
title: Eviction and Clearing of an Origin's Stored Graphs
status: done
rfcs: [RFC-007]
created: 2026-11-09
---

# SPIKE-010: Eviction and Clearing of an Origin's Stored Graphs

## 1. Question

When the browser evicts or the visitor clears an origin's storage, what remains, and what can the page observe? RFC-007 §2 says "a catalog stored beside the graphs may lose entries and graphs together, or one without the other", 7.5 asks how partial loss is detected and what the core does with an application graph whose store has vanished, and §5.8 asks for the measurement. This spike answers:

- After the origin's file storage is cleared, do engine stores and a catalog file disappear together, and is anything left (empty directories, files)?
- Can a page tell that storage was cleared: through `navigator.storage.estimate()`, `persisted()`, or an event?
- Can a store be cleared while a worker holds it open, and what does the holder see?
- Do the browsers offer a way to keep catalog and stores in one eviction unit (storage buckets)?

Not covered: real eviction under quota pressure (the browsers decide when; the spike clears storage on request and reads the browsers' documented policies), power loss, and clearing by user interface in Firefox and WebKit (not scriptable).

## 2. Method

A harness in `harness/` reuses SPIKE-008's static server and launcher. A dedicated worker creates two engine stores and a catalog file with sample content; the page records `estimate()` and `persisted()`.

- **E1, clear and observe (Chromium).** Through the DevTools protocol (`Storage.clearDataForOrigin`, storage type `file_systems`), clear the origin. Then list the origin-private root, reopen both stores, read the catalog file, read `estimate()`.
- **E2, clear with a holder.** The same with a worker holding one store open; observe what the holder's next write does and whether the store can be reopened.
- **E3, what a page can observe.** Compare `estimate().usage` before and after, and check for an event or promise that reports clearing.
- **E4, storage buckets.** Presence of `navigator.storageBuckets` in the three browsers, and in Chromium whether a store opened inside a bucket is cleared with its bucket's other data.
- **E5, policy.** The browsers' documented eviction units, collected from MDN's page on storage quotas and eviction criteria (last modified 2026-01-05, read 2026-11-09).

Firefox and WebKit have no scripted equivalent of `clearDataForOrigin` through Playwright; E1 to E3 are measured in Chromium only, and that limit is stated in the findings.

## 3. Time-box

One working session (about two hours).

## 4. Findings

Chromium only for E1 to E4 (a scripted clear is a DevTools protocol call); Firefox and WebKit were checked for storage-bucket support only. Single runs on one macOS machine, headless; raw results are in `harness/results/`.

### 4.1 Clearing the origin removes catalog and stores together

With two engine stores (5 and 7 nodes) and a catalog file present, `Storage.clearDataForOrigin` for file systems left the origin-private root empty: no `relate` directory and no `catalog.json` (131 files and 23,036 bytes of reported usage before, none after). Nothing survived to show that stores had existed. Reopening either store succeeded and returned an empty store (0 nodes), indistinguishable from a first run. Reading the catalog file failed with a not-found error.

### 4.2 Clearing while a store is held

A worker holding a store open when the origin was cleared saw its next write and its next query fail with `storage error: uncertain WAL outcome after safe LSN 7 / timestamp 7; close and reopen`. The root was empty while the store was held. After the holder ended, reopening gave an empty store and the engine recreated its 65 slot files.

### 4.3 What a page can observe

`estimate().usage` fell from 23,036 to 0 and stayed there; `persisted()` was false throughout. `navigator.storage` has no change event (`onquotachange` is absent in Chromium). The clear call itself returned in 1 ms. A page learns that storage was cleared only by finding its own data gone.

### 4.4 Storage buckets

`navigator.storageBuckets` exists in Chromium and not in Firefox or WebKit. A named bucket's directory held a file; after the origin was cleared the bucket's name was still listed but its files were gone, so a bucket registry entry can outlive the data and does not by itself signal loss. The engine opens its stores under the default origin-private root (`relate/<name>`) and takes no bucket argument, so its stores cannot be placed in a bucket.

### 4.5 Documented eviction behaviour

MDN's page on storage quotas and eviction criteria says browsers manage storage per origin and evict an origin's data as a whole (it warns that partial deletion could cause inconsistency), evict least-recently-used origins first under storage pressure, and spare origins whose storage is persistent. It says Safari additionally deletes script-written storage of an origin the visitor has not interacted with for seven days when cross-site tracking prevention is on. The page does not say a site can detect eviction. It does not name the origin-private file system in its eviction discussion.

## 5. Conclusion

Loss of the origin-private file storage is total: a catalog file goes with the stores it describes, so it cannot tell the page that stores were lost (RFC-007 7.5). Whether a catalog kept in another browser store (IndexedDB, for example) would survive was not measured, because the scripted clear covered file systems only; MDN documents eviction as whole-origin, which would take such a catalog along under storage pressure, but a user's selective clear could leave it. After a clear, a page that starts cold sees no stores, no entry and an empty store opened on demand: the same as a first visit. A live client that already holds a store is in a different position: it knows the store existed and receives a storage error (4.2). For a cold start, "report, or seed again" has no detectable trigger inside the origin, so a page that needs to notice loss must keep something outside the origin (an exported copy, a server record) or accept that loss looks like a first run; a live client can report the loss it has just seen.

What a catalog still has to guard against is partial loss from crashes and from clears that run while a store is held: the held store errors rather than silently continuing, and reopening yields an empty store with no marker. A cold start classifies that as a first run; a client that saw the error should report the loss instead of treating the reopened store as new.

Text for RFC-007 §2 and 7.5: "Measured in Chromium, clearing an origin's storage removed engine stores and a catalog file together and left nothing a cold-starting page could use to tell loss from a first visit; a store held at the time failed its next write; browsers document eviction as per origin and whole."

What is not covered: survival of IndexedDB or other stores after a file-systems-only or full clear; Firefox and WebKit clearing (not scriptable through Playwright); real eviction under pressure; whether a persistent-storage grant changes the outcome of a user's clear (it exempts pressure eviction only, per MDN).
