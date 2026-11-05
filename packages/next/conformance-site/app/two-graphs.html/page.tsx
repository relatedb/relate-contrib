import { GraphData } from "@relate/web-next/server";
import { Nav } from "../rel-shell";
import { InlineCount } from "../inline-count";

const make = (n: number, label: string) => ({ version: 1 as const, nodes: Array.from({ length: n }, (_, i) => ({ id: `${label}${i}`, labels: [label] })), links: [] });

export default function Page() {
  return (
    <main>
      <h1 data-rel-title>Two graphs</h1>
      <Nav />
      <div data-inline-page>
        <p>Alpha: <span data-inline-count="alpha">…</span> (generation <span data-inline-generation="alpha"></span>)</p>
        <p>Beta: <span data-inline-count="beta">…</span> (generation <span data-inline-generation="beta"></span>)</p>
        <GraphData id="alpha" page="/two-graphs.html" document={make(5, "A")} />
        <GraphData id="beta" page="/two-graphs.html" document={make(7, "B")} />
        <InlineCount name="alpha" />
        <InlineCount name="beta" />
      </div>
    </main>
  );
}
