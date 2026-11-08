// Writes the static descriptors and data the loaders cannot generate, for the core's conformance variants (the same id with another
// revision; counts that disagree; data that cannot be fetched). Run once and commit: node scripts/make-variants.mjs
import {writeFileSync} from "node:fs";
import {fileURLToPath} from "node:url";
import {sized} from "../docs/lib/example.js";

const out = fileURLToPath(new URL("../docs/variants/", import.meta.url));
const write = (name, value) => writeFileSync(out + name, JSON.stringify(value, null, 1) + "\n");
const index = [{label: "Page", property: "id"}];

const b = sized(400);
write("graph-b.json", {...b, revision: "example-b"});
// The descriptor names its data by a logical name; the page replaces it with the data file's published location.
write("descriptor-b.json", {version: 1, id: "example", revision: "example-b", data: {url: "variants/graph-b.json", nodes: b.nodes.length, links: b.links.length}, indexes: index});
const a = sized(300);
// The data is variant a's (from the loaders), but the descriptor claims one node fewer: the two disagree.
write("descriptor-mismatch.json", {version: 1, id: "example", revision: "example-a", data: {url: "data/example.graph.json", nodes: a.nodes.length - 1, links: a.links.length}, indexes: index});
// The data location does not exist: the page gives the descriptor a location that answers 404, so every attempt to load fails.
write("descriptor-broken.json", {version: 1, id: "example-broken", revision: "example-a", data: {url: "variants/missing.json", nodes: a.nodes.length, links: a.links.length}, indexes: index});
console.log("variants written to", out);
