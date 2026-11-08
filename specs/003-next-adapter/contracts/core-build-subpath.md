# Contract: `@relate/web/build`

An additive export of the core (FR-026 to FR-028). It imports nothing but the core's own validators and uses only `globalThis.crypto.subtle` for hashing (research D-1). It is the code that moves out of `@relate/astro`, with the Astro adapter importing it and behaving as before.

| Function | Behavior |
|---|---|
| `canonicalText(document)` | the document as text independent of key, node and link order; any `revision` it carries is dropped |
| `revisionOf(text)` | async; first 12 hexadecimal digits of the SHA-256 of the text |
| `prepare(owner, name, raw)` | async; validate with the core's validator, canonicalize, hash; counts; errors name `owner`, the graph and the first problem's path |
| `descriptorOf(name, evaluated, indexes, base, dataPath)` | the ADR-003 descriptor, `data.url` joined to the base path |
| `withBase(base, path)` | base path joined to a path without a doubled slash |
| `checkInline(owner, page, id, document, config, seen, registered)` | validate an inline graph and its `config`; errors name the page, the graph and the first problem |
| `escapeJson(value)` | JSON safe inside a script element |

Names above are the planned surface; the Astro code's current signatures are the starting point and the tasks fix the final ones. The core's own unit tests cover each function; the Astro adapter's existing tests pin revisions and are the check that nothing moved.
