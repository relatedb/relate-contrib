import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";

const here = fileURLToPath(new URL(".", import.meta.url));
export const fixtures = join(here, "../fixtures");
export const contracts = join(here, "../../../../specs/001-core-package/contracts");

export function load(path: string): unknown {
  return JSON.parse(readFileSync(path, "utf8"));
}

/** Fixture files in a directory (not the `.expect.json` sidecars), with the expected path if there is one. */
export function corpus(dir: string): Array<{ name: string; value: unknown; path: string | null }> {
  return readdirSync(join(fixtures, dir))
    .filter((f) => f.endsWith(".json") && !f.endsWith(".expect.json"))
    .sort()
    .map((f) => {
      const sidecar = join(fixtures, dir, f.replace(/\.json$/, ".expect.json"));
      let path: string | null = null;
      try {
        path = (load(sidecar) as { path: string }).path;
      } catch {
        /* valid fixtures have no sidecar */
      }
      return { name: f, value: load(join(fixtures, dir, f)), path };
    });
}

/** A compiled JSON Schema (draft 2020-12) validator for a contract schema. */
export function schemaValidator(file: string): (value: unknown) => boolean {
  const require = createRequire(import.meta.url);
  const mod = require("ajv/dist/2020.js") as { default?: unknown } & (new (o: object) => unknown);
  const Ajv = (mod.default ?? mod) as new (o: object) => { compile(s: object): (v: unknown) => boolean };
  const ajv = new Ajv({ allErrors: false, strict: true });
  return ajv.compile(load(join(contracts, file)) as object);
}
