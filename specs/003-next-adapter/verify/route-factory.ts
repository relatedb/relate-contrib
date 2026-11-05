import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
const read = () => { const d = JSON.parse(readFileSync("/tmp/v-source.json", "utf8")); if (process.env.V_RANDOM) d.nodes.push({ id: String(Math.random()) }); return d; };
const rev = (d: unknown) => createHash("sha256").update(JSON.stringify(d)).digest("hex").slice(0, 12);
export function createGraphRoute(ids: string[]) {
  const generateStaticParams = () => {
    console.log("[v] generateStaticParams pid", process.pid, "rev", rev(read()));
    return ids.flatMap((id) => [{ id, file: "descriptor.json" }, { id, file: `graph.${rev(read())}.json` }]);
  };
  const GET = async (_r: Request, { params }: { params: Promise<{ id: string; file: string }> }) => {
    const { id, file } = await params;
    const d = read();
    console.log("[v] GET", id, file, "pid", process.pid, "rev", rev(d));
    if (file === "descriptor.json") return Response.json({ id, revision: rev(d) });
    if (file !== `graph.${rev(d)}.json`) throw new Error(`revision mismatch for ${file}`);
    return Response.json(d);
  };
  return { GET, generateStaticParams };
}
