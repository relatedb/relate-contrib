import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

const here = (p: string) => fileURLToPath(new URL(p, import.meta.url));

export default defineConfig({
  resolve: {
    alias: {
      "virtual:relate/config": here("tests/helpers/virtual-config.ts"),
      "@relate/relate-wasm/relate_bg.wasm?url": here("tests/helpers/engine-url.ts"),
    },
  },
  test: {
    include: ["tests/unit/**/*.test.ts", "tests/build/**/*.test.ts"],
    environment: "node",
    testTimeout: 180_000,
    hookTimeout: 180_000,
  },
});
