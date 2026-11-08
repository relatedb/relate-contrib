import {createRequire} from "node:module";
import {readFileSync} from "node:fs";
const require = createRequire(process.cwd() + "/package.json");
process.stdout.write(readFileSync(require.resolve("@relate/relate-wasm/relate_bg.wasm")));
