// The conformance site: built once per navigation profile (NAVIGATION=multi-page|client-routing).
import { defineConfig } from "astro/config";
import { fileURLToPath } from "node:url";
import relatedWeb from "../dist/index.js";

const navigation = process.env.NAVIGATION === "client-routing" ? "client-routing" : "multi-page";
const here = (p) => fileURLToPath(new URL(p, import.meta.url));

export default defineConfig({
  output: "static",
  outDir: `./dist-${navigation}`,
  build: { format: "file" },
  integrations: [
    relatedWeb({
      navigation,
      graphs: {
        example: { source: "./src/graphs/example.ts", lifetime: "visit", indexes: [{ label: "Page", property: "id" }] },
        small: { source: "./src/graphs/small.ts" },
      },
    }),
  ],
  vite: {
    // The adapter is imported by name; here the name points at the package's own build output.
    resolve: {
      alias: {
        "related-web-astro/client": here("../dist/client/index.js"),
        "related-web-astro/graph-data": here("../src/GraphData.astro"),
      },
    },
    server: { fs: { allow: [here("../../../")] } },
  },
});
