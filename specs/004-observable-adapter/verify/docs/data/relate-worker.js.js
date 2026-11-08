import {createRequire} from "node:module";
import {build} from "esbuild";
const require = createRequire(process.cwd() + "/package.json");
const out = await build({entryPoints: [require.resolve("@relate/web/worker")], bundle: true, format: "esm", platform: "browser", write: false, logLevel: "error"});
process.stdout.write(out.outputFiles[0].text);
