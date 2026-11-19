// A small registry on a local port, answering from a table: for the gate's and the engine lane's tests, which must not reach the real one.
import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";

export interface Entry {
  versions: string[];
  deprecated?: string[];
}

export interface StandIn {
  url: string;
  /** Count of requests answered. */
  requests: () => number;
  close(): Promise<void>;
}

export async function startRegistry(table: Record<string, Entry>, opts: { fail?: boolean } = {}): Promise<StandIn> {
  let count = 0;
  const server: Server = createServer((req, res) => {
    count++;
    if (opts.fail) {
      res.writeHead(503).end("down");
      return;
    }
    const name = decodeURIComponent((req.url ?? "").replace(/^\//, ""));
    const entry = table[name];
    if (!entry) {
      res.writeHead(404, { "content-type": "application/json" }).end(JSON.stringify({ error: "not found" }));
      return;
    }
    const versions = Object.fromEntries(entry.versions.map((v) => [v, entry.deprecated?.includes(v) ? { deprecated: "withdrawn" } : {}]));
    res.writeHead(200, { "content-type": "application/json" }).end(JSON.stringify({ name, versions }));
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const { port } = server.address() as AddressInfo;
  return {
    url: `http://127.0.0.1:${port}`,
    requests: () => count,
    close: () => new Promise((resolve) => server.close(() => resolve())),
  };
}
