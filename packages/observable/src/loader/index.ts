// The loader entry (contracts/loader-entry.md): imported from data loaders, which Framework runs as Node scripts with the
// project root as working directory. Each helper writes its file to standard output and, on failure, stops the build.
import { readFileSync } from "node:fs";
import { dirname } from "node:path";
import { build } from "esbuild";
import { fail } from "./fail.js";
import { resolveFromSite } from "./resolve.js";

export { descriptor, document } from "./graph.js";
export type { DescriptorOptions, Source } from "./graph.js";

/** The bytes of the installed engine's binary, so a loader that calls this publishes it under a content-hashed name. */
export async function engine(): Promise<void> {
  try {
    process.stdout.write(readFileSync(resolveFromSite("@relate/relate-wasm/relate_bg.wasm")));
  } catch (e) {
    fail(`@relate/observable: engine(): the engine's binary was not found (is @relate/relate-wasm installed?): ${e instanceof Error ? e.message : String(e)}`);
  }
}

/**
 * The core's worker and the engine's script glue in one self-contained ES module, made now from the packages the site has
 * installed, so the glue and the binary come from the same engine. The engine is resolved from the site and not from wherever
 * the core's files happen to be, because the glue and the binary only work together.
 */
export async function worker(): Promise<void> {
  try {
    const enginePackage = dirname(resolveFromSite("@relate/relate-wasm/relate_bg.wasm"));
    const result = await build({
      entryPoints: [resolveFromSite("@relate/web/worker")],
      bundle: true,
      format: "esm",
      platform: "browser",
      write: false,
      logLevel: "silent",
      alias: { "@relate/relate-wasm": enginePackage },
    });
    process.stdout.write(result.outputFiles[0]!.text);
  } catch (e) {
    fail(`@relate/observable: worker(): the worker could not be bundled: ${e instanceof Error ? e.message : String(e)}`);
  }
}
