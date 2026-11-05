// The WASM engine run in a Node server route.
import { readFileSync } from "node:fs";
import { join } from "node:path";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const t0 = performance.now();
  const mod: any = await import("@neo4j-labs/cypherlite-wasm");
  const wasmPath = join(/*turbopackIgnore: true*/ process.cwd(), "node_modules/@neo4j-labs/cypherlite-wasm/cypherlite_bg.wasm");
  await mod.default({ module_or_path: readFileSync(wasmPath) });
  const db = new mod.CypherliteDb();
  const out = JSON.parse(db.execute("RETURN 1 + 1 AS two", null));
  return Response.json({ out, ms: Math.round(performance.now() - t0) });
}
