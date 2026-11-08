// The Vite plugin: the two virtual modules (spec FR-012). `virtual:relate/config` is what the client reads;
// `virtual:relate/sources` holds the sources and is imported only by the injected route, on the server.
import type { Plugin } from "vite";
import type { ResolvedOptions } from "./options.js";
import { descriptorPath, withBase } from "./sources.js";

const CONFIG = "virtual:relate/config";
const SOURCES = "virtual:relate/sources";

export interface BuildContext {
  /** The site's `base` setting. */
  base: string;
  /** True for the development server, where a failing source must not stop the server. */
  dev: boolean;
}

export function relatePlugin(options: ResolvedOptions, context: BuildContext): Plugin {
  return {
    name: "@relate/astro",
    resolveId(id) {
      if (id === CONFIG || id === SOURCES) return `\0${id}`;
      return null;
    },
    load(id) {
      if (id === `\0${CONFIG}`) {
        const graphs = Object.fromEntries(
          options.graphs.map((g) => [g.name, { descriptor: withBase("__BASE__", descriptorPath(g.name)), lifetime: g.lifetime }]),
        );
        return [
          `const entries = ${JSON.stringify(graphs).replaceAll("__BASE__", context.base.replace(/\/+$/, ""))};`,
          `export const navigation = ${JSON.stringify(options.navigation)};`,
          `export const graphs = entries;`,
        ].join("\n");
      }
      if (id === `\0${SOURCES}`) {
        const imports: string[] = [];
        const rows = options.graphs.map((g, i) => {
          imports.push(`import s${i} from ${JSON.stringify(g.source)};`);
          const load = g.source.endsWith(".json") ? `() => s${i}` : `s${i}`;
          return `{ name: ${JSON.stringify(g.name)}, indexes: ${JSON.stringify(g.indexes)}, load: ${load} }`;
        });
        return `${imports.join("\n")}\nexport const base = ${JSON.stringify(context.base)};\nexport const dev = ${JSON.stringify(context.dev)};\nexport default [${rows.join(",\n")}];`;
      }
      return null;
    },
  };
}
