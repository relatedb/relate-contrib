// SPIKE_EXPORT=1 builds a static export; SPIKE_BASE sets basePath.
const base = process.env.SPIKE_BASE || "";
export default {
  serverExternalPackages: process.env.SPIKE_EXTERNAL ? ["@neo4j-labs/cypherlite-wasm"] : [],
  ...(process.env.SPIKE_EXPORT ? { output: "export" } : {}),
  ...(base ? { basePath: base } : {}),
  env: { NEXT_PUBLIC_BASE: base },
};
