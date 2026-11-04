// The shared graph of the conformance pages: 300 pages with 5 links each (the count the scenarios expect).
export default function example() {
  const pages = 300;
  const nodes = Array.from({ length: pages }, (_, i) => ({
    id: `p${i}`,
    labels: ["Page"],
    properties: { slug: `/p/${i}`, title: `Page ${i}`, section: `s${i % 20}` },
  }));
  const links = [];
  for (let i = 0; i < pages; i++) {
    for (let j = 1; j <= 5; j++) links.push({ source: `p${i}`, target: `p${(i * 7 + j * 13) % pages}`, type: "LINKS_TO" });
  }
  return { version: 1 as const, nodes, links };
}
