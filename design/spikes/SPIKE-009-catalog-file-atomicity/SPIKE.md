---
id: SPIKE-009
title: A Catalog File in Origin-Private Storage
status: done
rfcs: [RFC-007]
created: 2026-11-09
---

# SPIKE-009: A Catalog File in Origin-Private Storage

## 1. Question

Can a small file in the origin's private storage (OPFS) carry a catalog of persisted graphs? RFC-007 §5.2 lists "one small file per graph" and a single catalog file as candidates, §5.5 asks how several tabs read and write it, and §5.8 asks for the measurement. This spike answers:

- Can every tab read the file while another tab holds an engine store open (RFC-007 7.1)?
- Is replacing the file atomic: does a reader ever see a torn or empty file, and what does a writer terminated mid-replace leave behind (RFC-007 7.2)?
- Which replacement method is available in each browser, and which orders several writers without losing updates (RFC-007 5.5)?

Not covered: eviction (SPIKE-010), the engine's own listing and metadata (SPIKE-011), IndexedDB as a catalog (a candidate in RFC-007 5.2 that needs no OPFS).

## 2. Method

A harness in `harness/` reuses SPIKE-008's static server and browser launcher (Chromium, Firefox, WebKit in a persistent profile). A dedicated module worker (`worker.js`) exposes file operations on the origin-private root; `exp.mjs` holds the experiments, `run.mjs` runs them per browser, raw results go to `harness/results/`.

- **E1, capability matrix.** Presence of `createWritable`, `createSyncAccessHandle`, `FileSystemFileHandle.move`, and `navigator.locks` in a dedicated worker and on the page.
- **E2, read beside an open store.** One tab opens an engine store (`opfs://catalog-e2`) and holds it; a second tab reads and replaces a catalog file in the same origin-private root and lists the root.
- **E3, torn reads.** A writer replaces a 50 KB self-checking JSON file 300 times with each available method (swap through `createWritable`, in-place sync access handle, write-then-`move`); a reader in another worker reads the file in a tight loop. Counted: reads, parse or check failures, missing-file and other errors, generations going backwards.
- **E4, terminated writer.** The writer is terminated at a random point in the loop, 20 times per method; afterwards the file is read and the directory listed (leftover swap or temporary files).
- **E5, concurrent writers.** Three tabs each perform 100 read-increment-write cycles on one counter file, with and without a Web Lock around each cycle. Counted: final value against 300.
- **E6, lock release.** A worker holding a Web Lock is terminated, or its tab closed; time until a waiting tab acquires it (five runs each).
- **E7, locked replace.** As E3, with the writer holding an exclusive Web Lock around each replace and the reader a shared lock around each read.

Single runs on one macOS machine, headless. Nothing tests power loss.

## 3. Time-box

One working session (about three hours); the whole run is about five minutes per browser.

## 4. Findings

All figures are single runs on one macOS machine, headless; raw results are in `harness/results/`.

### 4.1 Availability

`createWritable`, `createSyncAccessHandle`, `FileSystemFileHandle.move` and Web Locks are present in a dedicated worker in all three browsers. WebKit's `move` rejects the one-argument form (`move(name)`) that Chromium and Firefox accept and needs `move(directory, name)`. `navigator.storageBuckets` exists in Chromium only.

### 4.2 Reading and writing beside an open store

In all three browsers a second tab read, replaced and listed `catalog.json` while the first tab held an engine store open; the origin-private root listed `relate` (the engine's directory) and `catalog.json` side by side, and the holder's queries kept working. A second tab's attempt to open the held store failed at once with `storage locked: opfs://catalog-e2`.

### 4.3 Replacing the file without a lock

A writer replaced a 50 KB self-checking file 300 times while another tab read it in a loop (reads per run 387 to 1,076):

| Browser | Method | Torn reads | Other read failures |
|---|---|---|---|
| Chromium | swap (`createWritable`) | 0 | 37 not-found, 71 not-readable |
| Chromium | in place (sync handle) | 207 (155 empty) | 56 not-readable |
| Chromium | temporary file then `move` | 0 | 48 not-found, 45 not-readable |
| Firefox | swap | 0 | 0 |
| Firefox | in place | 12 (10 empty) | 0 |
| Firefox | temporary file then `move` | 0 | 0 |
| WebKit | swap | 167 (all empty) | 0 |
| WebKit | in place | 59 (all empty) | 0 |
| WebKit | temporary file then `move` | 1 (partial) | 0 |

So an unlocked replace is atomic for readers only through swap in Chromium and Firefox and through `move` in Firefox. WebKit's swap is not atomic: a reader sees an empty file in about a third of the reads. Chromium's swap and `move` never tear but make the file briefly absent or unreadable, so a reader has to retry. No read ever saw generations go backwards.

### 4.4 A writer terminated mid-write

Twenty terminations per method and browser, at a random point in a write loop: the file was readable within 84 ms in every case and held a complete generation in all runs except one in-place write in Firefox (a torn file). A temporary file left behind by the `move` method was seen in all three browsers (`catalog.json.tmp`). Swap left no extra entries.

### 4.5 Several writers

Three tabs each performed 100 read-increment-write cycles on one counter (the swap method):

| Browser | Without a lock (final value) | With an exclusive Web Lock |
|---|---|---|
| Chromium | 98 (291 writes succeeded; 9 failed as not-readable) | 300 of 300 |
| Firefox | 104 of 300 | 300 of 300 |
| WebKit | 91 of 300 | 300 of 300 |

Without a lock most updates are lost in every browser. With a lock none were.

### 4.6 A lock held by a terminated holder

A Web Lock held by a terminated worker was granted to a waiting tab after 1 to 5 ms; when the holder's tab was closed, after 4 to 8 ms (five runs each, all three browsers).

### 4.7 Locked replace and read

With an exclusive Web Lock around every replace and a shared one around every read (E7), no read in any browser with any method was torn, missing or failed (445 to 619 reads per run). Combined with 4.5, the lock makes all three methods safe for readers and writers.

## 5. Conclusion

A catalog file in the origin's private storage works in Chromium, Firefox and WebKit, alongside an open engine store and readable from every tab (RFC-007 7.1, 5.5), provided that readers and writers go through a Web Lock. Without it the options differ by browser and none is safe everywhere: atomic replace by swap fails in WebKit, and updates from several tabs are lost in all three. With a lock the replace method does not matter for readers, and a terminated holder releases the lock within a few milliseconds.

Terminated-writer results (RFC-007 7.2): the file stayed whole after every termination, apart from one torn in-place write in Firefox, so swap (or a lock plus swap) leaves no window in which the catalog is half-written. A temporary-file-and-`move` scheme leaves a temporary file behind that a reader has to ignore or a reconciliation step has to remove.

Text for RFC-007 §5.2 and 7.1: "Measured in Chromium, Firefox and WebKit, a catalog file beside the engine's stores can be read and replaced from any tab while another tab holds a store, and writers from several tabs lose no update when each takes a Web Lock; without the lock, updates are lost and WebKit's replace can expose an empty file."

What is not covered: power loss; files much larger than 50 KB; many catalog files (SPIKE-011 lists a directory); eviction (SPIKE-010).
