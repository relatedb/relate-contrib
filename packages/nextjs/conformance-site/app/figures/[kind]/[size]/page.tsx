import { GraphData } from "@relate/contrib-nextjs/server";
import { notFound } from "next/navigation";
import { Nav } from "../../../rel-shell";
import { FigureProbe } from "../../../figure-probe";
import { sized } from "../../../../lib/documents";

const SIZES = [20, 300, 2000];
export const generateStaticParams = () => ["inline", "registered"].flatMap((kind) => SIZES.map((size) => ({ kind, size: String(size) })));

// The same document as an inline graph and as a registered graph, to compare their load figures.
export default async function Page({ params }: { params: Promise<{ kind: string; size: string }> }) {
  const { kind, size } = await params;
  if (!["inline", "registered"].includes(kind) || !SIZES.includes(Number(size))) notFound();
  return (
    <main>
      <h1 data-rel-title>{`Figure: ${kind} ${size}`}</h1>
      <Nav />
      <div data-figure-page>
        <p>Total ms: <span data-figure-total>…</span></p>
        {kind === "inline" && <GraphData id="graph" page={`/figures/inline/${size}`} document={sized(Number(size))} />}
        <FigureProbe name={kind === "inline" ? "graph" : `fig${size}`} />
      </div>
    </main>
  );
}
