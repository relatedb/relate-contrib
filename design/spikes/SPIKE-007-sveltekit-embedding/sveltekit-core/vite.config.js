import adapterNode from "@sveltejs/adapter-node";
import adapterStatic from "@sveltejs/adapter-static";
import { sveltekit } from "@sveltejs/kit/vite";
import { defineConfig } from "vite";

// ALLOW=1 lets the dev server serve files from the repository root (the workspace-linked core lives there).
// ADAPTER=static|node chooses the output, BASE sets a base path, OUT names the build directory, OPTIMIZE=exclude adds the core and
// the engine to optimizeDeps.exclude (the Astro adapter's setting). SvelteKit 3 takes its configuration here, not in svelte.config.js.
const out = process.env.OUT ?? "build";
const adapter = process.env.ADAPTER === "node" ? adapterNode({ out }) : adapterStatic({ pages: out, assets: out, strict: true });

export default defineConfig({
  plugins: [sveltekit({ adapter, paths: { base: process.env.BASE ?? "" } })],
  server: { host: "127.0.0.1", port: Number(process.env.PORT ?? 5400), ...(process.env.ALLOW === "1" ? { fs: { allow: ["../../../.."] } } : {}) },
  ...(process.env.OPTIMIZE === "exclude" ? { optimizeDeps: { exclude: ["@relate/web", "@relate/relate-wasm"] } } : {})
});
