import adapterNode from "@sveltejs/adapter-node";
import adapterStatic from "@sveltejs/adapter-static";
import { sveltekit } from "@sveltejs/kit/vite";
import { defineConfig } from "vite";

// The conformance site: ADAPTER=static|node chooses the output, BASE sets a base path, OUT names the build (its output directory
// and its own SvelteKit working directory, so builds can run side by side), NAVIGATION is read by src/hooks.server.ts, PORT is the
// development server's. SvelteKit 3 takes its configuration here, not in svelte.config.js. The repository root is allowed for the
// development server because the packages are workspace links that live outside this folder (SPIKE-007).
const out = process.env.OUT ?? "build";
const adapter = process.env.ADAPTER === "node" ? adapterNode({ out }) : adapterStatic({ pages: out, assets: out, strict: true });

export default defineConfig({
  plugins: [sveltekit({ adapter, outDir: `.svelte-kit-${out}`, paths: { base: process.env.BASE ?? "" } })],
  define: { __NAVIGATION__: JSON.stringify(process.env.NAVIGATION ?? "client-routing") },
  server: { host: "127.0.0.1", port: Number(process.env.PORT ?? 5485), fs: { allow: ["../../.."] } },
});
