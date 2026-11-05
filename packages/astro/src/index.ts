// The Astro integration (spec FR-001 to FR-012, ADR-004 2.1 and 2.2).
import type { AstroIntegration } from "astro";
import { fileURLToPath } from "node:url";
import { resolveOptions, type RelateWebOptions } from "./options.js";
import { relateWebPlugin } from "./plugin.js";

export type { RelateWebOptions, GraphOption, Lifetime, Navigation } from "./options.js";

export default function relateWeb(options?: RelateWebOptions): AstroIntegration {
  return {
    name: "@relate/web-astro",
    hooks: {
      "astro:config:setup": ({ command, config, injectRoute, updateConfig }) => {
        if (config.output !== "static") {
          throw new Error(`@relate/web-astro: only static output is supported, but output is "${config.output}"`);
        }
        const resolved = resolveOptions(options, fileURLToPath(config.root));
        updateConfig({
          vite: {
            plugins: [relateWebPlugin(resolved, { base: config.base, dev: command === "dev" })],
            // The component is an .astro file in this package, which Vite must compile instead of externalizing.
            ssr: { noExternal: ["@relate/web-astro"] },
            // The engine's binary is placed by the bundler; the dev server must not pre-bundle it.
            optimizeDeps: { exclude: ["@neo4j-labs/cypherlite-wasm"] },
          },
        });
        if (resolved.graphs.length > 0) {
          injectRoute({ pattern: "/_relate/[id]/[file]", entrypoint: new URL("./routes/files.js", import.meta.url), prerender: true });
        }
      },
    },
  };
}
