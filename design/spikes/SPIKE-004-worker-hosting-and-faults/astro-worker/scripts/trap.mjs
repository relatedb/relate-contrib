// SPIKE-004 step 0: can any statement provoke a trap (WebAssembly.RuntimeError)
// on purpose? Tries inputs that stress recursion and memory, each on a fresh
// instance, and classifies the outcome with the bundle's own isWasmTrap.
// Usage: node scripts/trap.mjs
import {readFileSync} from "node:fs";
import {fileURLToPath} from "node:url";
import init, {CypherliteDb} from "@neo4j-labs/cypherlite-wasm";
import {isWasmTrap} from "../.wasm-build/pkg/trap.js";

await init({module_or_path: readFileSync(fileURLToPath(new URL("../.wasm-build/pkg/cypherlite_bg.wasm", import.meta.url)))});

const nest = (n, open, close, inner = "1") => open.repeat(n) + inner + close.repeat(n);
const cases = [
  ...[100, 1000, 10000, 100000].map((n) => [`parens x${n}`, `RETURN ${nest(n, "(", ")")} AS x`]),
  ...[100, 1000, 10000, 100000].map((n) => [`list nesting x${n}`, `RETURN ${nest(n, "[", "]")} AS x`]),
  ...[100, 1000, 10000, 50000].map((n) => [`unary minus x${n}`, `RETURN ${"-".repeat(n)}1 AS x`]),
  ...[1000, 10000, 100000].map((n) => [`addition chain x${n}`, `RETURN 1${"+1".repeat(n)} AS x`]),
  ...[1000, 10000].map((n) => [`NOT chain x${n}`, `RETURN ${"NOT ".repeat(n)}true AS x`]),
  ["huge range", "UNWIND range(1, 1000000000) AS i RETURN count(i) AS c"]
];

for (const [label, cypher] of cases) {
  if (label === "huge range") continue; // runaway candidate, tried separately
  const db = new CypherliteDb();
  let outcome;
  const t0 = performance.now();
  try {
    const result = JSON.parse(db.execute(cypher, null));
    outcome = result.error ? `engine error: ${String(result.error).slice(0, 70)}` : "ok";
  } catch (e) {
    outcome = `THROWN ${isWasmTrap(e) ? "TRAP" : "non-trap"}: ${String(e?.message ?? e).slice(0, 70)}`;
  }
  console.log(`${label.padEnd(22)} ${Math.round(performance.now() - t0).toString().padStart(6)} ms  ${outcome}`);
  try { db.free(); } catch {}
}
