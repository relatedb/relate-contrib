// Writes the static descriptors and data the integration cannot generate, for the core's conformance variants
// (same id with another revision; counts that disagree; data that cannot be fetched). Run once and commit:
//   pnpm exec tsx conformance-site/make-variants.ts
import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const out = fileURLToPath(new URL("./public/", import.meta.url));
const write = (name: string, value: unknown): void => writeFileSync(out + name, JSON.stringify(value, null, 1) + "\n");

function generate(pages: number, revision: string, dataUrl: string, id = "example") {
  const nodes = Array.from({ length: pages }, (_, i) => ({ id: `p${i}`, labels: ["Page"], properties: { slug: `/p/${i}`, title: `Page ${i}`, section: `s${i % 20}` } }));
  const links = [];
  for (let i = 0; i < pages; i++) for (let j = 1; j <= 5; j++) links.push({ source: `p${i}`, target: `p${(i * 7 + j * 13) % pages}`, type: "LINKS_TO" });
  return {
    document: { version: 1, revision, nodes, links },
    descriptor: { version: 1, id, revision, data: { url: dataUrl, nodes: nodes.length, links: links.length }, indexes: [{ label: "Page", property: "id" }] },
  };
}

const a = generate(300, "example-a", "/graph-a.json");
const b = generate(400, "example-b", "/graph-b.json");
write("graph-a.json", a.document);
write("graph-b.json", b.document);
write("descriptor-b.json", b.descriptor);
// The data is variant a's, but the descriptor claims one node fewer: the two disagree.
write("descriptor-mismatch.json", { ...a.descriptor, data: { ...a.descriptor.data, nodes: a.descriptor.data.nodes - 1 } });
// The data location does not exist: every attempt to load fails.
write("descriptor-broken.json", { ...a.descriptor, id: "example-broken", data: { ...a.descriptor.data, url: "/missing.json" } });
console.log("variants written to", out);
