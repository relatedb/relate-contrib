---
id: SPIKE-011
title: Enumerating the Engine's Browser Stores
status: done
rfcs: [RFC-007]
created: 2026-11-09
---

# SPIKE-011: Enumerating the Engine's Browser Stores

## 1. Question

Can the engine list its own stores or hold per-store metadata, and if not, what can the page learn by listing the origin-private storage itself? RFC-007 7.1 asks whether the engine provides a per-store metadata slot or a catalog of its stores, 7.4 asks what is learnable about size, and §5.8 asks for the measurement. This spike answers:

- Does the engine package's public interface expose listing, size, or metadata for browser stores?
- What does the origin-private root look like with several stores: directory names, file counts and sizes, anything an engine-maintained index would replace?
- Can a store's existence, approximate size and last-modified time be read from the directory alone, without opening the store?
- What does listing cost for 1, 10 and 100 stores?

Not covered: asking the engine's maintainers for a slot (a follow-up if the findings call for one) and a design for the catalog itself.

## 2. Method

A harness in `harness/` reuses SPIKE-008's static server and launcher.

- **E1, interface.** The exported names of the engine package (`relate.d.ts`, `opfs.d.ts`, and the loaded module's own property names) searched for listing, size, metadata and checkpoint calls.
- **E2, layout.** Create stores of 0, 1,000 and 20,000 nodes under names `rel-a`, `app-b`, `other`; list the root recursively; record directory and file names, sizes, `lastModified`.
- **E3, deduction.** From the listing alone, derive each store's name, whether it holds data, and a size sum; compare the sum with the store's real contents and with `navigator.storage.estimate()`.
- **E4, cost.** Time a recursive listing and size sum with 1, 10 and 100 stores present, in a worker and on the page.
- **E5, held store.** List the layout while another worker holds one of the stores open (sync access handles locked) and note which reads fail.

Run in Chromium, Firefox and WebKit (WebKit persistent). Single runs on one macOS machine.

## 3. Time-box

One working session (about two hours).

## 4. Findings

Single runs on one macOS machine, headless (WebKit in a persistent profile); raw results are in `harness/results/`.

### 4.1 The engine's public interface

The package exports `init` and `RelateDb`. `RelateDb` has one static member, `open(uri, read_only)`, and the instance members `execute`, `executeScript`, `reset` and `free`. A keyword search of both type declarations finds no call for listing stores, a store's size, metadata, checkpoint, existence or deletion. The low-level OPFS module declares `slotSize(id)` and `prepareOpfs(name)` (returning `{ catalog, slots }`): these belong to the engine's own storage layer, not to the browser API for a page.

### 4.2 What the directory shows

Under `relate/` each store is a directory named as opened, holding 65 files whatever the store's size (stores of 0, 1,000 and 20,000 nodes of about 100 bytes each; two of the 65 files were non-empty in each):

| Store | Nodes | Sum of file sizes |
|---|---|---|
| `rel-a` | 0 | 52 bytes |
| `app-b` | 1,000 | 218,910 bytes |
| `other` | 20,000 | 4,439,454 bytes |

The sums were identical in the three browsers. Each store directory also gave a newest modification time that followed creation order. A listing gives a store's name, whether it holds more than a fresh store (52 bytes), its approximate size and when it last changed. It gives nothing about kind, format, version or state beyond what a naming convention puts in the name.

### 4.3 Size against the browser's figure

Sum of store sizes 4,658,416 bytes; `estimate().usage` 4,690,242 in Chromium (the sum is 99.3% of it), 5,149,936 in Firefox (90%) and 13,631,488 in WebKit (34%). The origin-level figure also covers anything else the origin stores, and WebKit's is far larger than the files it holds (the cause was not examined), so per-store sizes from a listing are closer to the stores' real size than the origin figure is.

### 4.4 Cost of listing

Time to list the stores and sum file sizes (median of three, worker; the page's main thread took between 5% less and 42% more):

| Stores | Chromium | Firefox | WebKit |
|---|---|---|---|
| 1 | 7.6 ms | 21.6 ms | 24.7 ms |
| 10 | 52 ms | 192 ms | 234 ms |
| 100 | 520 ms | 1,950 ms | 2,310 ms |

Cost grows linearly with the number of stores, about 5 ms per store in Chromium and 20 to 25 ms in Firefox and WebKit, because every one of a store's 65 files is read for its size. A listing of names alone (no `getFile` per file) was not timed.

### 4.5 A store held by another worker

With one of three stores open in another worker, the listing and size sum succeeded for all three with no unreadable file; the held store's files were readable (917 bytes, against 795 for the idle stores), in all three browsers, from a worker and from the page.

## 5. Conclusion

The engine has no listing, size or metadata call a page can use (RFC-007 7.1), so a catalog cannot rely on the engine to enumerate stores today; whether to ask the engine's maintainers for a per-store metadata slot is still the open question, and this result is the baseline for that request: nothing exists. A page can list the stores itself from the directory, with size and last-modified time, even while another tab holds a store, and without opening it; the price is a file read per slot file, which is cheap for a handful of stores (7 to 25 ms for one, 50 to 230 ms for ten) and not for a hundred in Firefox and WebKit (about two seconds). Kind, version and state are not in the directory and have to be recorded somewhere: the catalog file measured in SPIKE-009 is the candidate that fits, with the listing used to reconcile it (RFC-007 5.4).

On size (RFC-007 7.4): a per-store size is learnable from the directory without any engine change, and is closer to a store's real size than the origin-level estimate; the engine call is not a prerequisite.

Text for RFC-007 §5.2 and 7.1, 7.4: "The engine exposes no call to list stores or read their size or metadata. A page can enumerate them from the origin-private directory and read each store's size and modification time without opening it, including while another tab holds one; the listing grows linearly with the number of stores (about 5 ms per store in Chromium, 20 to 25 ms in Firefox and WebKit)."

What is not covered: the cost of a names-only listing, stores with indexes or relationships (sizes were measured with one label and a 100-byte property), stores larger than 20,000 nodes, and a request to the engine's maintainers.
