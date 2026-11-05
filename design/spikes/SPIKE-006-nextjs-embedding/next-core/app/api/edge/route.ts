// The same, declared for the edge runtime.
export const runtime = "edge";
export const dynamic = "force-dynamic";

export async function GET() {
  const mod: any = await import("@neo4j-labs/cypherlite-wasm");
  await mod.default({ module_or_path: new URL("@neo4j-labs/cypherlite-wasm/cypherlite_bg.wasm", import.meta.url) });
  const db = new mod.CypherliteDb();
  return Response.json(JSON.parse(db.execute("RETURN 1 + 1 AS two", null)));
}
