---
"@relate/contrib-web": patch
---

A page can observe a client: a `statement` event for each statement the worker runs (with its engine time, counters, whether it wrote, and why it ran), `client.revision` with a `revision` event that rises on every write, and `client.info` (name, kind, read-only flag and engine version). Nothing changes for a client that does not use them. ADR-001, amendment of 2026-11-27.
