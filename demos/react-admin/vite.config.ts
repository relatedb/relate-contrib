import react from "@vitejs/plugin-react";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";

const repoRoot = fileURLToPath(new URL("../../", import.meta.url));

// The core is imported from its build output, so the demo runs the artifact that ships, including the worker URL
// that bundlers resolve. The engine binary stays out of dependency pre-bundling so its URL is the package's own.
export default defineConfig({
  plugins: [react()],
  server: { host: "127.0.0.1", port: 5190, strictPort: true, fs: { allow: [repoRoot] } },
  worker: { format: "es" },
  build: { target: "es2022" },
  optimizeDeps: { exclude: ["@relate/relate-wasm"] },
});
