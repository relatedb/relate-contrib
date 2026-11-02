// Writes synthetic site graphs (the same generator as delivery.mjs) as static
// JSON the explore page can load with ?graph=/synthetic/graph-N.json.
// Usage: node scripts/synthesize.mjs [sizes, default 100,1000,5000]
import {mkdirSync, writeFileSync} from "node:fs";
import {fileURLToPath} from "node:url";

const sizes = (process.argv[2] ?? "100,1000,5000").split(",").map(Number);
const out = fileURLToPath(new URL("../public/synthetic/", import.meta.url));
mkdirSync(out, {recursive: true});

function mulberry32(seed) {
  return () => {
    seed |= 0; seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

for (const n of sizes) {
  const rand = mulberry32(42);
  const pages = Array.from({length: n}, (_, id) => ({id, slug: `page-${id}`, title: `Page ${id}`, section: String(id % 8)}));
  const links = [];
  for (const p of pages) {
    const seen = new Set([p.id]);
    for (let k = 0; k < Math.min(5, n - 1); k++) {
      let to;
      do {
        const same = rand() < 0.7;
        to = same ? Math.floor(rand() * Math.ceil(n / 8)) * 8 + (p.id % 8) : Math.floor(rand() * n);
        if (to >= n) to = Math.floor(rand() * n);
      } while (seen.has(to));
      seen.add(to);
      links.push({from: p.id, to});
    }
  }
  writeFileSync(`${out}graph-${n}.json`, JSON.stringify({pages, links}));
  console.log(`graph-${n}.json: ${pages.length} pages, ${links.length} links`);
}
