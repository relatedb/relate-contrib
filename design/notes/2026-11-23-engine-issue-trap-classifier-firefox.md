# Filed as relatedb/relate#717: `isWasmTrap` misses Firefox's stack overflow and the error a dead instance throws next

(Filed upstream on 2026-11-23: https://github.com/relatedb/relate/issues/717. Engine examined: `@relate/relate-wasm` 1.2.0 from the registry.)

## Summary

`trap.js` (`isWasmTrap`) decides whether an error thrown by a call into the bundle means the WebAssembly instance is unusable. Its documented cases include stack exhaustion, but the pattern only knows Chromium's and WebKit's wording. When a statement overflows the stack:

- **Firefox** throws `InternalError: too much recursion`. `isWasmTrap` returns `false`.
- **Node** (observed; the browsers were not probed past the first call) throws `Error: recursive use of an object detected which would lead to unsafe aliasing in rust` on the next call into the same instance, because the overflow left the instance's borrow held. `isWasmTrap` returns `false` for that too.

A host that follows the documented contract ("a trapped instance must be replaced") therefore keeps using a broken instance on Firefox, and anywhere a host does not stop at the first trap.

## Reproduction

```js
// 1.2.0, Node, browser glue from the bundle
const db = new RelateDb();
try { db.execute(`RETURN ${"1+".repeat(30000)}1 AS x`, null); }
catch (e) { console.log(e.constructor.name, e.message, isWasmTrap(e)); }
// Node/Chromium: RangeError  Maximum call stack size exceeded  true
// Firefox:       InternalError  too much recursion             false

try { db.execute("RETURN 1", null); }
catch (e) { console.log(e.message, isWasmTrap(e)); }
// Node:  recursive use of an object detected which would lead to unsafe aliasing in rust  false
```

Observed through a real worker in Playwright (macOS, Playwright 1.64, 200 000 terms, 1 000 000 terms gives the same):

| Browser | first call | `isWasmTrap` |
|---|---|---|
| Chromium | `Maximum call stack size exceeded` | true |
| WebKit | `Maximum call stack size exceeded.` | true |
| Firefox | `InternalError: too much recursion` | false |

## Suggested fix

Extend the pattern in `trap.js` with `too much recursion` (Firefox) and `recursive use of an object` (the follow-on error of any overflowed instance). Keep the rest as is.

## Context

Engine 1.2.0 turned the deep-nesting overflow we used to rely on (`RETURN ((((…1…))))`, 1 000 levels) into a syntax error, `maximum nesting depth of 500`. That is a good change. The statement that still overflows the stack is a long flat chain, `RETURN 1+1+1+…`, which is handled by a recursive step beyond the parser's depth limit. If the engine closes that one too, a host loses its only way to provoke a trap in tests; a documented test-only way to trigger one (a debug statement or an exported function) would help every host.

## Our side

The `relate-contrib` core now treats both messages as traps itself (`isEngineTrap`, `packages/web/src/worker/engine.ts`) and no longer depends on the engine's pattern for them.
