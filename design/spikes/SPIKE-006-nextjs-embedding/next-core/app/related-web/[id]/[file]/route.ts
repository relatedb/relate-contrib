// A registered graph served by a route handler (the Next counterpart of the Astro adapter's injected route).
import descriptor from "../../../../public/descriptor.json";
import graph from "../../../../public/graph.json";

export const dynamic = "force-static";
export const dynamicParams = false;
const REVISION = "abc123def456";

export function generateStaticParams() {
  return [
    { id: "example", file: "descriptor.json" },
    { id: "example", file: `graph.${REVISION}.json` },
  ];
}

export async function GET(_req: Request, { params }: { params: Promise<{ id: string; file: string }> }) {
  const { file } = await params;
  const body = file === "descriptor.json" ? { ...descriptor, revision: REVISION } : graph;
  return Response.json(body);
}
