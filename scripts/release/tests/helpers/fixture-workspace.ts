// A scratch workspace in a temporary folder, with packages whose manifests a test can break one item at a time.
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { CORE, ENGINE_LOADERS, type Manifest } from "../../lib/workspace.js";

export interface Fixture {
  root: string;
  /** Write or replace a package's manifest. */
  write(folder: string, manifest: Manifest): void;
  remove(): void;
}

/** A manifest that passes every check, for a package of this name. */
export function goodManifest(name: string, over: Partial<Manifest> = {}): Manifest {
  const folder = name.replace("@relate/contrib-", "");
  const manifest: Manifest = {
    name,
    version: "0.1.0",
    private: true,
    license: "Apache-2.0",
    repository: { type: "git", url: "https://github.com/relatedb/relate-contrib", directory: `packages/${folder}` },
    homepage: `https://github.com/relatedb/relate-contrib/tree/main/packages/${folder}`,
    keywords: ["relate"],
    publishConfig: { access: "public" },
    files: ["dist", "README.md", "LICENSE"],
    peerDependencies: {},
    scripts: name === CORE ? { "test:unit": "vitest", "test:package": "vitest", "test:trace": "tsx" } : { [`test:${folder}`]: "vitest", [`test:${folder}-package`]: "vitest", [`test:${folder}-trace`]: "tsx" },
  };
  if (ENGINE_LOADERS.includes(name)) manifest.peerDependencies!["@relate/relate-wasm"] = ">=0.16.1 <=0.16.1";
  if (name !== CORE) manifest.peerDependencies![CORE] = ">=0.0.0 <1.0.0";
  return { ...manifest, ...over };
}

/** A workspace of the seven packages, with the license files and a catalog entry for the engine. */
export function makeFixture(over: Record<string, Partial<Manifest>> = {}): Fixture {
  const root = mkdtempSync(join(tmpdir(), "release-fixture-"));
  const names = [CORE, ...["astro", "nextjs", "observable", "sveltekit", "react-admin", "phaser"].map((n) => `@relate/contrib-${n}`)];
  const f: Fixture = {
    root,
    write(folder, manifest) {
      mkdirSync(join(root, folder), { recursive: true });
      writeFileSync(join(root, folder, "package.json"), JSON.stringify(manifest, null, 2));
    },
    remove: () => rmSync(root, { recursive: true, force: true }),
  };
  writeFileSync(join(root, "LICENSE"), "Apache License, Version 2.0\n");
  writeFileSync(join(root, "pnpm-workspace.yaml"), 'packages:\n  - "packages/*"\ncatalog:\n  \"@relate/relate-wasm\": 0.16.1\n');
  for (const name of names) {
    const folder = `packages/${name === CORE ? "web" : name.replace("@relate/contrib-", "")}`;
    f.write(folder, goodManifest(name, over[name] ?? {}));
    writeFileSync(join(root, folder, "LICENSE"), "Apache License, Version 2.0\n");
  }
  return f;
}
