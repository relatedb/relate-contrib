import { defineConfig } from "vite";
import { fileURLToPath } from "node:url";

const here = fileURLToPath(new URL(".", import.meta.url));
const repoRoot = fileURLToPath(new URL("../../../../../../", import.meta.url));

// Serves the application harness pages. The core is imported from its build output (dist), so the tests exercise
// the artifact that ships, including the worker URL that bundlers resolve.
export default defineConfig({
  root: here,
  server: { fs: { allow: [repoRoot] } },
  worker: { format: "es" },
  build: { target: "es2022" },
  optimizeDeps: { exclude: ["@relate/relate-wasm"] },
});
