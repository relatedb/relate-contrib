import { defineConfig } from "vite";

export default defineConfig({
  server: {
    port: 5174,
    // the engine's package is linked from vendor/relate-wasm/pkg, outside this folder
    fs: { allow: ["../.."] },
  },
  // the worker and the engine's loader locate their files by import.meta.url; leave them unbundled in development
  optimizeDeps: { exclude: ["@relate/web", "@relate/relate-wasm"] },
  worker: { format: "es" },
  build: { target: "es2022" },
});
