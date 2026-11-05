// Documents for the conformance pages. `sized(n)` is `n` pages with 5 links each, so the shared graph's count is the one
// the core's scenarios expect (300).
export function sized(pages: number) {
  const nodes = Array.from({ length: pages }, (_, i) => ({ id: `p${i}`, labels: ["Page"], properties: { slug: `/p/${i}`, title: `Page ${i}`, section: `s${i % 20}` } }));
  const links: Array<{ source: string; target: string; type: string }> = [];
  for (let i = 0; i < pages; i++) for (let j = 1; j <= 5; j++) links.push({ source: `p${i}`, target: `p${(i * 7 + j * 13) % pages}`, type: "LINKS_TO" });
  return { version: 1 as const, nodes, links };
}

/** A small graph for the lifetime and inline pages. */
export function small() {
  const nodes = Array.from({ length: 20 }, (_, i) => ({ id: `n${i}`, labels: ["Item"], properties: { n: i } }));
  const links = Array.from({ length: 19 }, (_, i) => ({ source: `n${i}`, target: `n${i + 1}`, type: "NEXT" }));
  return { version: 1 as const, nodes, links };
}
