// Documents of a given size, for the load-figure pages: `n` pages with 5 links each (as the shared example graph).
export function sized(pages: number) {
  const nodes = Array.from({ length: pages }, (_, i) => ({ id: `p${i}`, labels: ["Page"], properties: { slug: `/p/${i}`, title: `Page ${i}`, section: `s${i % 20}` } }));
  const links: Array<{ source: string; target: string; type: string }> = [];
  for (let i = 0; i < pages; i++) for (let j = 1; j <= 5; j++) links.push({ source: `p${i}`, target: `p${(i * 7 + j * 13) % pages}`, type: "LINKS_TO" });
  return { version: 1 as const, nodes, links };
}
