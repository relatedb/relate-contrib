// Copy the built .wasm binary into docs/data so Framework serves it as a
// static file. graphDbClient.js hands its URL to init() explicitly; the glue's
// default `new URL(..., import.meta.url)` lookup does not resolve under
// Framework's bundler (SPIKE-001, finding 4.2).
import {copyFileSync, existsSync, mkdirSync} from "node:fs";
import {dirname, join} from "node:path";
import {fileURLToPath} from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const candidates = [
  join(root, "node_modules/@neo4j-labs/cypherlite-wasm/cypherlite_bg.wasm"),
  join(root, ".wasm-build/pkg/cypherlite_bg.wasm")
];
const source = candidates.find(existsSync);
if (!source) {
  console.error("cypherlite_bg.wasm not found; run `npm run build:wasm` then `npm install`.");
  process.exit(1);
}
const target = join(root, "docs/data/cypherlite_bg.wasm");
mkdirSync(dirname(target), {recursive: true});
copyFileSync(source, target);
console.log(`sync-wasm: ${source} -> ${target}`);
