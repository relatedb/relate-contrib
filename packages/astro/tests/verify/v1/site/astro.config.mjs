import { defineConfig } from "astro/config";
import v1 from "../integration.mjs";
export default defineConfig({ output: "static", build: { format: "file" }, integrations: [v1()] });
