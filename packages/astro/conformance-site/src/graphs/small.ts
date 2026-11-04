// A small graph for the lifetime and inline pages.
export default function small() {
  const nodes = Array.from({ length: 20 }, (_, i) => ({ id: `n${i}`, labels: ["Item"], properties: { n: i } }));
  const links = Array.from({ length: 19 }, (_, i) => ({ source: `n${i}`, target: `n${i + 1}`, type: "NEXT" }));
  return { version: 1 as const, nodes, links };
}
