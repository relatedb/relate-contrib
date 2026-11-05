// Static server: node scripts/serve.mjs <dir> <port> [basePath]
import { createServer } from "node:http";
import { readFileSync, existsSync, statSync } from "node:fs";
import { extname, join } from "node:path";
const [dir, port, base = ""] = process.argv.slice(2);
const types = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".json": "application/json", ".wasm": "application/wasm", ".txt": "text/plain" };
createServer((req, res) => {
  let p = decodeURIComponent(new URL(req.url, "http://x").pathname);
  if (base) { if (!p.startsWith(base)) { res.writeHead(404).end(); return; } p = p.slice(base.length) || "/"; }
  let f = join(dir, p);
  if (existsSync(f) && statSync(f).isDirectory()) f = existsSync(join(f, "index.html")) ? join(f, "index.html") : f + ".html";
  if (!existsSync(f) && existsSync(f + ".html")) f += ".html";
  if (!existsSync(f)) { res.writeHead(404).end("not found"); return; }
  res.writeHead(200, { "content-type": types[extname(f)] ?? "application/octet-stream" }).end(readFileSync(f));
}).listen(Number(port));
