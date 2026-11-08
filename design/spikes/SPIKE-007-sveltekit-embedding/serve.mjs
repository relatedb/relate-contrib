// A static file server for an adapter-static build: node serve.mjs <directory> <port> [base]. `/early` is served from `early.html`,
// as a static host that maps clean URLs does; a base path is stripped.
import { createReadStream, existsSync, statSync } from "node:fs";
import { createServer } from "node:http";
import { extname, join, normalize, resolve } from "node:path";
const [, , dir, port, base = ""] = process.argv;
const root = resolve(dir);
const types = { ".html": "text/html; charset=utf-8", ".js": "text/javascript", ".json": "application/json", ".wasm": "application/wasm", ".css": "text/css" };
createServer((req, res) => {
  let path = normalize(decodeURIComponent(new URL(req.url, "http://x").pathname)).replace(/^(\.\.[/\\])+/, "");
  if (base && path.startsWith(base)) path = path.slice(base.length) || "/";
  let file = join(root, path);
  // a route with a server load also has a folder of that name (for its __data.json), so the page file wins over the folder
  if (existsSync(file) && statSync(file).isDirectory()) file = existsSync(file + ".html") ? file + ".html" : join(file, "index.html");
  if (!existsSync(file) && existsSync(file + ".html")) file += ".html";
  if (!existsSync(file)) return void res.writeHead(404, { "content-type": "text/plain" }).end("not found");
  res.writeHead(200, { "content-type": types[extname(file)] ?? "application/octet-stream" });
  createReadStream(file).pipe(res);
}).listen(Number(port), "127.0.0.1");
