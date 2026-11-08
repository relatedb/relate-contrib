// Deterministic graphs for the loader and timing tests: N pages with a fixed number of links each.
import type { Descriptor, GraphDocument } from "../../src/data/types.js";

export interface GeneratedGraph {
  descriptor: Descriptor;
  document: GraphDocument;
}

export function generateGraph(
  pages: number,
  options: { linksPerPage?: number; id?: string; revision?: string; dataUrl?: string; indexes?: boolean } = {},
): GeneratedGraph {
  const linksPerPage = options.linksPerPage ?? 5;
  const revision = options.revision ?? `gen-${pages}`;
  const nodes = Array.from({ length: pages }, (_, i) => ({
    id: `p${i}`,
    labels: ["Page"],
    properties: { slug: `/p/${i}`, title: `Page ${i}`, section: `s${i % 20}` },
  }));
  const links: GraphDocument["links"] = [];
  for (let i = 0; i < pages; i++) {
    for (let j = 1; j <= linksPerPage; j++) {
      links.push({ source: `p${i}`, target: `p${(i * 7 + j * 13) % pages}`, type: "LINKS_TO" });
    }
  }
  const document: GraphDocument = { version: 1, revision, nodes, links };
  const descriptor: Descriptor = {
    version: 1,
    id: options.id ?? `gen-${pages}`,
    revision,
    data: { url: options.dataUrl ?? `/data/gen-${pages}.json`, nodes: nodes.length, links: links.length },
    ...(options.indexes === false ? {} : { indexes: [{ label: "Page", property: "id" }] }),
  };
  return { descriptor, document };
}
