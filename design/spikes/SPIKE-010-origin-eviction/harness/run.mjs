import { writeFileSync, mkdirSync } from "node:fs";
import { serve, launch, PORT } from "./lib.mjs";
import * as exps from "./exp.mjs";

const [browser, ...names] = process.argv.slice(2);
mkdirSync("results", { recursive: true });
const server = await serve(PORT);
const b = await launch(browser);
const results = {};
try {
  for (const n of names) {
    const t = Date.now();
    results[n] = await exps[n](b.context);
    console.log(`${browser} ${n} done in ${Math.round((Date.now() - t) / 1000)}s`);
    writeFileSync(`results/${browser}-${names.join("+")}.json`, JSON.stringify(results, null, 2));
  }
} finally { await b.close(); server.close(); }
console.log(JSON.stringify(results, null, 1));
