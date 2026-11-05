import { defineConfig } from "vite";
import { fileURLToPath } from "node:url";
import { readdirSync } from "node:fs";

const here = fileURLToPath(new URL(".", import.meta.url));
const repoRoot = fileURLToPath(new URL("../../../../", import.meta.url));

// Multi-page build of the plain example pages: every .html file in this directory is an entry.
const input = Object.fromEntries(
  readdirSync(here)
    .filter((f) => f.endsWith(".html"))
    .map((f) => [f.replace(/\.html$/, ""), fileURLToPath(new URL(f, import.meta.url))]),
);

export default defineConfig({
  root: here,
  // Adapters import the package by name; here the name points at the package's own build output.
  resolve: { alias: { "@relate/web-core": fileURLToPath(new URL("../../dist/index.js", import.meta.url)) } },
  server: { fs: { allow: [repoRoot] } },
  worker: { format: "es" },
  build: { target: "es2022", rollupOptions: { input } },
  optimizeDeps: { exclude: ["@neo4j-labs/cypherlite-wasm"] },
});
