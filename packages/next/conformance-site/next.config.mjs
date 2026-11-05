// The conformance site: one build per NAVIGATION (client-routing or multi-page), as a production server build or, with
// EXPORT=1, a static export. CACHE_COMPONENTS=1 adds `cacheComponents`, the setting under which the router keeps a
// departed page in the document. BASE_PATH adds a base path. BUNDLER is read by the build command, not here.
import { fileURLToPath } from "node:url";
import { withRelateWeb } from "@relate/web-next";

const navigation = process.env.NAVIGATION === "multi-page" ? "multi-page" : "client-routing";
const name = process.env.BUILD_NAME ?? navigation;
const exported = process.env.EXPORT === "1";
const root = fileURLToPath(new URL("../../../", import.meta.url));

export default withRelateWeb(
  {
    distDir: exported ? `out-${name}` : `.next-${name}`,
    ...(exported ? { output: "export" } : {}),
    ...(process.env.CACHE_COMPONENTS === "1" ? { cacheComponents: true } : {}),
    ...(process.env.BASE_PATH ? { basePath: process.env.BASE_PATH } : {}),
    // the development server answers the tests' address
    allowedDevOrigins: ["127.0.0.1"],
    // the workspace's packages are symlinks into the repository root
    turbopack: { root },
    outputFileTracingRoot: root,
    reactStrictMode: process.env.STRICT !== "0",
  },
  { navigation },
);
