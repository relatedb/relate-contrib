// Static server for the spike: the harness page and worker, and the vendored engine package at /pkg.
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const pkg = join(here, "../../../../vendor/relate-wasm/pkg");
const types = { ".js": "text/javascript", ".html": "text/html; charset=utf-8", ".wasm": "application/wasm", ".json": "application/json" };

export function serve(port = 5590) {
  const server = createServer(async (req, res) => {
    const url = new URL(req.url, "http://x");
    const file = url.pathname.startsWith("/pkg/") ? join(pkg, url.pathname.slice(5)) : join(here, url.pathname === "/" ? "page.html" : url.pathname.slice(1));
    try {
      const body = await readFile(file);
      const ext = file.slice(file.lastIndexOf("."));
      res.writeHead(200, { "content-type": types[ext] ?? "application/octet-stream", "cache-control": "no-store", "cross-origin-opener-policy": "same-origin", "cross-origin-embedder-policy": "require-corp" });
      res.end(body);
    } catch {
      res.writeHead(404).end("not found");
    }
  });
  return new Promise((resolve) => server.listen(port, "127.0.0.1", () => resolve(server)));
}
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  await serve();
  console.log("http://127.0.0.1:5590/");
}
