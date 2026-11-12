// covers-ra: FR-001, FR-029, FR-031, SC-007
// Packs the package, the core and the engine, installs them in a clean project outside this repository (with react-admin and
// its peers beside them, as a user would), builds a provider over a small client on the real engine, creates a company and a
// person and lists them, and type-checks a file that uses the package's exported types. This shows the package works as
// published: its files, exports and peer ranges, that nothing in it points back into this repository, and that its
// declarations resolve against react-admin's and the core's.
import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const pkg = resolve(fileURLToPath(new URL("../..", import.meta.url)));
const repo = resolve(pkg, "../..");
const core = join(repo, "packages/web");
const engine = join(repo, "vendor/relate-wasm/pkg");

let work = "";
let consumer = "";
let tarball = "";

const run = (command: string, args: string[], cwd: string): string =>
  execFileSync(command, args, { cwd, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"], env: { ...process.env, CI: "1" }, maxBuffer: 64 * 1024 * 1024 });
const tarballIn = (dir: string, prefix: string): string => join(dir, readdirSync(dir).find((f) => f.startsWith(prefix) && f.endsWith(".tgz"))!);

const files: Record<string, string> = {
  "check.mjs": `import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { createDataProvider } from "@relate/react-admin";

// the engine, in memory, initialised from the installed package's binary
const dir = dirname(createRequire(import.meta.url).resolve("@relate/relate-wasm"));
const mod = await import(join(dir, "relate.js"));
await mod.default({ module_or_path: readFileSync(join(dir, "relate_bg.wasm")) });
const db = new mod.RelateDb();
const client = {
  status: "ready",
  diagnostic: null,
  async query(statement, params) {
    return JSON.parse(db.execute(statement, params && Object.keys(params).length ? JSON.stringify(params) : null));
  },
};

const schema = {
  resources: {
    companies: { label: "Company", fields: [{ name: "name", type: "string", sortable: true, filterable: true, searchable: true }] },
    people: {
      label: "Person",
      fields: [{ name: "name", type: "string", sortable: true, filterable: true, searchable: true }, { name: "age", type: "number", sortable: true, filterable: true }],
      references: [{ field: "company", resource: "companies", type: "WORKS_AT" }],
    },
  },
};
const provider = createDataProvider(client, schema);
const company = await provider.create("companies", { data: { name: "Acme" } });
await provider.create("people", { data: { name: "Ada", age: 36, company: company.data.id } });
await provider.create("people", { data: { name: "Bo", age: 30 } });
const list = await provider.getList("people", { pagination: { page: 1, perPage: 10 }, sort: { field: "age", order: "DESC" }, filter: {} });
const searched = await provider.getList("people", { pagination: { page: 1, perPage: 10 }, sort: { field: "id", order: "ASC" }, filter: { q: "ADA" } });
const duplicate = await provider.create("people", { data: { id: list.data[0].id, name: "dup" } }).then(() => "created", (e) => String(e.status));
console.log(JSON.stringify({ company: company.data, total: list.total, searched: searched.data.map((r) => r.name), names: list.data.map((r) => r.name), companyOfFirst: list.data[0].company, duplicate }));
`,
  "types.ts": `import { createDataProvider, ensureSchema, ProviderError, type ProviderClient, type Schema } from "@relate/react-admin";
import type { DataProvider } from "react-admin";

const schema: Schema = { resources: { things: { label: "Thing", fields: [{ name: "name", type: "string", sortable: true }] } } };
declare const client: ProviderClient;
export const provider: DataProvider = createDataProvider(client, schema, { onStatement: (statement, params) => void [statement, params], timeoutMs: 5000 });
export const ensured: Promise<void> = ensureSchema(client, schema);
export const isProviderError = (e: unknown): number | undefined => (e instanceof ProviderError ? e.status : undefined);
`,
  "tsconfig.json": JSON.stringify({ compilerOptions: { target: "ES2022", module: "ES2022", moduleResolution: "Bundler", strict: true, skipLibCheck: true, noEmit: true }, include: ["types.ts"] }),
};

beforeAll(() => {
  work = mkdtempSync(join(tmpdir(), "relate-react-admin-clean-install-"));
  expect(work.startsWith(repo)).toBe(false); // the project is outside this repository
  run("pnpm", ["run", "build"], core);
  run("pnpm", ["run", "build"], pkg);
  run("pnpm", ["pack", "--pack-destination", work], core);
  run("pnpm", ["pack", "--pack-destination", work], pkg);
  tarball = tarballIn(work, "relate-react-admin-");

  consumer = join(work, "consumer");
  mkdirSync(consumer, { recursive: true });
  writeFileSync(join(consumer, "package.json"), JSON.stringify({ name: "consumer", private: true, type: "module" }));
  writeFileSync(join(consumer, "pnpm-workspace.yaml"), "allowBuilds:\n  esbuild: true\n");
  run(
    "pnpm",
    ["add", "--prefer-offline", tarball, tarballIn(work, "relate-web-"), `file:${engine}`, "react-admin@5.15.6", "react@^19", "react-dom@^19", "react-router@^7", "react-hook-form@^7", "@tanstack/react-query@^5", "typescript@^7"],
    consumer,
  );
  for (const [path, text] of Object.entries(files)) writeFileSync(join(consumer, path), text);
}, 600_000);

afterAll(() => {
  if (work) rmSync(work, { recursive: true, force: true });
});

describe("the packed package in a clean project", () => {
  it("ships its build output and declarations only, with the peers declared and no runtime dependency or repository path", () => {
    const listing = run("tar", ["-tzf", tarball], work).split("\n").filter(Boolean);
    for (const f of ["package/package.json", "package/dist/index.js", "package/dist/index.d.ts", "package/dist/provider.js"]) expect(listing, f).toContain(f);
    expect(listing.some((f) => /\b(tests|src|specs|vendor|node_modules)\//.test(f))).toBe(false);
    const manifest = JSON.parse(readFileSync(join(consumer, "node_modules/@relate/react-admin/package.json"), "utf8"));
    expect(manifest.dependencies).toBeUndefined();
    expect(Object.keys(manifest.peerDependencies).sort()).toEqual(["@relate/web", "react-admin"]);
    expect(manifest.peerDependencies["react-admin"]).toMatch(/^\^5/);
    // nothing in what was installed points back into this repository
    const installed = join(consumer, "node_modules/@relate/react-admin");
    const all = readdirSync(installed, { recursive: true, encoding: "utf8" }).filter((f) => /\.(js|ts|json)$/.test(f));
    for (const f of all) expect(readFileSync(join(installed, f), "utf8"), f).not.toContain(repo);
  });

  it("builds a provider over a client on the real engine, creates a company and a person, lists them, and refuses a duplicate id", () => {
    const out = JSON.parse(run("node", ["check.mjs"], consumer).trim().split("\n").at(-1)!);
    expect(out.company.name).toBe("Acme");
    expect(out.total).toBe(2);
    expect(out.names).toEqual(["Ada", "Bo"]); // by age, descending
    expect(out.searched).toEqual(["Ada"]); // a search is case-insensitive
    expect(out.companyOfFirst).toBe(out.company.id);
    expect(out.duplicate).toBe("400");
  });

  it("has declarations that resolve against react-admin's and the core's types", () => {
    expect(() => run("pnpm", ["exec", "tsc", "-p", "tsconfig.json"], consumer)).not.toThrow();
  });
});
