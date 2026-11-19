import { GraphData } from "@relate/contrib-nextjs/server";
import { DirectProbe } from "../direct-probe";
import { Nav } from "../rel-shell";

export default function Page() {
  return (
    <main>
      <h1 data-rel-title>Direct lookup</h1>
      <Nav />
      <p>Count: <span data-direct-count>…</span></p>
      <p data-direct-errors></p>
      <GraphData id="notebook" page="/direct.html" document={{ version: 1, nodes: [{ id: "a" }], links: [] }} />
      <DirectProbe />
    </main>
  );
}
