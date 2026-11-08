import { GraphData } from "@relate/nextjs/server";
import { Nav } from "../rel-shell";
import { InlineCount } from "../inline-count";

const nodes = Array.from({ length: 12 }, (_, i) => ({ id: `n${i}`, labels: ["Item"], properties: { n: i } }));
const links = nodes.slice(1).map((n, i) => ({ source: `n${i}`, target: n.id, type: "NEXT" }));

export default function Page() {
  return (
    <main>
      <h1 data-rel-title>Inline graph</h1>
      <Nav />
      <div data-inline-page>
        <p>Nodes: <span data-inline-count="notebook">…</span></p>
        <GraphData id="notebook" page="/inline.html" document={{ version: 1, nodes, links }} config={{ indexes: [{ label: "Item", property: "id" }] }} />
        <InlineCount name="notebook" />
      </div>
    </main>
  );
}
