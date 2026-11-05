import { GraphData } from "@relate/web-next/server";
import { notFound } from "next/navigation";
import { Nav } from "../../gw-shell";
import { InlineCount } from "../../inline-count";
import { NavLink } from "../../nav-link";
import { recipes } from "../../../lib/recipes";

export const dynamicParams = false;
export const generateStaticParams = () => Object.keys(recipes).map((slug) => ({ slug }));

export default async function Page({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const entry = recipes[slug];
  if (!entry) notFound();
  // The graph is built from this page's own content: one node per step.
  const nodes = entry.steps.map((step, i) => ({ id: `s${i}`, labels: ["Step"], properties: { step } }));
  const links = nodes.slice(1).map((n, i) => ({ source: `s${i}`, target: n.id, type: "THEN" }));
  return (
    <main>
      <h1 data-gw-title>{entry.title}</h1>
      <Nav />
      <p>{Object.keys(recipes).map((s) => <NavLink key={s} href={`/recipes/${s}`}>{recipes[s]!.title}</NavLink>)}</p>
      <div data-inline-page>
        <p>Steps: <span data-inline-count="steps">…</span></p>
        <GraphData id="steps" page={`/recipes/${slug}`} document={{ version: 1, nodes, links }} />
        <InlineCount name="steps" />
      </div>
    </main>
  );
}
