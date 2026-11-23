// pnpm injects workspace packages into this site as hard-linked copies made at install time (research D-4). An edit to an
// existing built file shows through the link; a new or removed file does not, and a reinstall does not add it. So the
// site copies the packages' published files over the injected copies before every build.
import { cpSync, existsSync, readFileSync, realpathSync, rmSync, statSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const site = join(dirname(fileURLToPath(import.meta.url)), "..");
const packages = join(site, "../..");

for (const [name, folder] of [["contrib-web", "web"], ["contrib-observable", "observable"]]) {
  const source = join(packages, folder);
  const target = realpathSync(join(site, "node_modules/@relate", name));
  // with the engine from the registry pnpm may link the package itself instead of injecting a copy; there is nothing to refresh, and removing "its" files would remove the package's own build
  if (target === realpathSync(source)) continue;
  const manifest = JSON.parse(readFileSync(join(source, "package.json"), "utf8"));
  for (const entry of manifest.files ?? ["dist"]) {
    if (!existsSync(join(source, entry))) continue;
    rmSync(join(target, entry), { recursive: true, force: true });
    cpSync(join(source, entry), join(target, entry), { recursive: true });
  }
  // the manifest is a hard link to the package's own when pnpm made the copy; copying a file onto itself is an error
  const [from, to] = [join(source, "package.json"), join(target, "package.json")];
  if (!existsSync(to) || statSync(from).ino !== statSync(to).ino) cpSync(from, to);
}
console.log("refresh-deps: injected copies of @relate/contrib-web and @relate/contrib-observable refreshed");
