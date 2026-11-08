// The `cacheComponents` setting refuses the route segment settings `dynamic` and `dynamicParams` (research V-8), so the
// cache build of the conformance site is made from a copy of the site without them: `node variant.mjs cache` writes
// `.variants/cache/`, which is built and served in place of the site. The site's own files are never touched.
import { cpSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";

const [, , mode] = process.argv;
if (mode !== "cache") throw new Error(`variant.mjs: unknown variant "${mode}"`);
const target = `.variants/${mode}`;
rmSync(target, { recursive: true, force: true });
mkdirSync(target, { recursive: true });
for (const entry of ["app", "lib", "public", "next.config.mjs", "tsconfig.json"]) cpSync(entry, `${target}/${entry}`, { recursive: true });
for (const file of ["app/relate/[id]/[file]/route.ts", "app/recipes/[slug]/page.tsx"]) {
  const path = `${target}/${file}`;
  const text = readFileSync(path, "utf8");
  writeFileSync(path, text.split("\n").filter((l) => !/^export const (dynamic|dynamicParams) = /.test(l)).join("\n"));
}
