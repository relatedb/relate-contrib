// The graph sources of the conformance site. `sized(n)` is `n` pages with 5 links each, so the shared graph's count is the one the
// core's scenarios expect (300); it is the same document the Astro and Next conformance sites publish.
export function sized(pages) {
  const nodes = Array.from({length: pages}, (_, i) => ({id: `p${i}`, labels: ["Page"], properties: {slug: `/p/${i}`, title: `Page ${i}`, section: `s${i % 20}`}}));
  const links = [];
  for (let i = 0; i < pages; i++) for (let j = 1; j <= 5; j++) links.push({source: `p${i}`, target: `p${(i * 7 + j * 13) % pages}`, type: "LINKS_TO"});
  return {version: 1, nodes, links};
}

/** A small graph for the pages that carry a graph of their own. */
export function small() {
  const nodes = Array.from({length: 20}, (_, i) => ({id: `n${i}`, labels: ["Item"], properties: {n: i}}));
  const links = Array.from({length: 19}, (_, i) => ({source: `n${i}`, target: `n${i + 1}`, type: "NEXT"}));
  return {version: 1, nodes, links};
}

export default () => sized(300);
