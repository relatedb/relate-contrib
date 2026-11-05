// The integration's options: parsing, defaults and the configuration-time failures (spec FR-002 to FR-005).
import { existsSync } from "node:fs";
import { isAbsolute, resolve } from "node:path";
import { validateDescriptor } from "@relate/web-core/validate";
import type { IndexSpec } from "@relate/web-core/validate";

export type Lifetime = "page" | "visit";
export type Navigation = "multi-page" | "client-routing";

export interface GraphOption {
  /** A module whose default export returns an ADR-002 document (or a promise of one), or a `.json` file holding one. */
  source: string;
  indexes?: IndexSpec[];
  /** `page` (default): the client ends with the page that asks. `visit`: shared by pages, retained under client-side routing. */
  lifetime?: Lifetime;
}

export interface RelateWebOptions {
  graphs?: Record<string, GraphOption>;
  navigation?: Navigation;
}

export interface ResolvedGraph {
  name: string;
  /** Absolute path of the source. */
  source: string;
  indexes: IndexSpec[];
  lifetime: Lifetime;
}

export interface ResolvedOptions {
  graphs: ResolvedGraph[];
  navigation: Navigation;
}

const fail = (message: string): never => {
  throw new Error(`@relate/web-astro: ${message}`);
};

/** Parse and check the options. `root` is the site's root, which relative sources are resolved against. */
export function resolveOptions(input: RelateWebOptions | undefined, root: string, exists: (path: string) => boolean = existsSync): ResolvedOptions {
  const options = input ?? {};
  const navigation = options.navigation ?? "multi-page";
  if (navigation !== "multi-page" && navigation !== "client-routing") {
    fail(`navigation must be "multi-page" or "client-routing", not ${JSON.stringify(navigation)}`);
  }
  const graphs: ResolvedGraph[] = [];
  const seen = new Set<string>();
  for (const [name, entry] of Object.entries(options.graphs ?? {})) {
    const label = `graphs.${name}`;
    if (seen.has(name)) fail(`${label}: duplicate graph name`);
    seen.add(name);
    if (typeof entry !== "object" || entry === null || typeof entry.source !== "string") fail(`${label}: source must be a path`);
    const lifetime = entry.lifetime ?? "page";
    if (lifetime !== "page" && lifetime !== "visit") fail(`${label}: lifetime must be "page" or "visit", not ${JSON.stringify(lifetime)}`);
    // The name and the indexes are checked by the rules of the descriptor they end up in (ADR-003).
    const probe = validateDescriptor({
      version: 1,
      id: name,
      revision: "0",
      data: { url: "/x", nodes: 0, links: 0 },
      ...(entry.indexes ? { indexes: entry.indexes } : {}),
    });
    if (!probe.ok) fail(`${label}: ${probe.path}: ${probe.message}`);
    const source = isAbsolute(entry.source) ? entry.source : resolve(root, entry.source);
    if (!exists(source)) fail(`${label}: the source ${entry.source} does not exist`);
    graphs.push({ name, source, indexes: entry.indexes ?? [], lifetime });
  }
  return { graphs, navigation };
}
