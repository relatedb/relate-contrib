// Writes the example site's data: two variants of a small graph of pages (a and b, different revisions and sizes),
// a descriptor whose counts do not match its data, and a descriptor whose data cannot be fetched.
// Run: pnpm exec tsx conformance/make-example.ts
import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { generateGraph } from "../tests/fixtures/generate-graph.js";

const out = fileURLToPath(new URL("./example-site/public/", import.meta.url));
const write = (name: string, value: unknown): void => writeFileSync(out + name, JSON.stringify(value, null, 1) + "\n");

const a = generateGraph(300, { id: "example", revision: "example-a", dataUrl: "/graph.json" });
const b = generateGraph(400, { id: "example", revision: "example-b", dataUrl: "/graph-b.json" });

write("graph.json", a.document);
write("descriptor.json", a.descriptor);
write("graph-b.json", b.document);
write("descriptor-b.json", b.descriptor);
// The data is variant a's, but the descriptor claims one node fewer: the two disagree.
write("descriptor-mismatch.json", { ...a.descriptor, data: { ...a.descriptor.data, nodes: a.descriptor.data.nodes - 1 } });
// The data location does not exist: every attempt to load fails.
write("descriptor-broken.json", { ...a.descriptor, id: "example-broken", data: { ...a.descriptor.data, url: "/missing.json" } });
console.log("example data written to", out);
