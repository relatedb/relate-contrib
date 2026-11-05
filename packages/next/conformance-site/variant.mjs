// The `cacheComponents` setting refuses the route segment settings `dynamic` and `dynamicParams` (research V-8), so the
// cache build of the conformance site is made from copies of the two files without them. `node variant.mjs cache` strips
// them (keeping `*.orig`), `node variant.mjs standard` restores the originals.
import { copyFileSync, existsSync, readFileSync, renameSync, writeFileSync } from "node:fs";

const files = ["app/relate-web/[id]/[file]/route.ts", "app/recipes/[slug]/page.tsx"];
const [, , mode] = process.argv;
for (const file of files) {
  if (mode === "cache") {
    if (!existsSync(file + ".orig")) copyFileSync(file, file + ".orig");
    const text = readFileSync(file + ".orig", "utf8");
    writeFileSync(file, text.split("\n").filter((l) => !/^export const (dynamic|dynamicParams) = /.test(l)).join("\n"));
  } else if (existsSync(file + ".orig")) {
    renameSync(file + ".orig", file);
  }
}
