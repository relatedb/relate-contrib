import { svelte } from "@sveltejs/vite-plugin-svelte";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

// The Svelte plugin lets unit tests compile the package's components and render them with `svelte/server`.
export default defineConfig({
  plugins: [svelte({ compilerOptions: { runes: true } })],
  resolve: { conditions: ["svelte", "node"], alias: { "$app/paths": fileURLToPath(new URL("./tests/helpers/app-paths-stub.ts", import.meta.url)) } },
  test: {
    include: ["tests/unit/**/*.test.ts", "tests/build/**/*.test.ts"],
    environment: "node",
    testTimeout: 300_000,
    hookTimeout: 300_000,
  },
});
