// covers-cat: FR-023, FR-024, FR-025, FR-026, FR-027, SC-009
import { spawnSync } from "node:child_process";
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const pkg = join(import.meta.dirname, "../../..");
const repo = join(pkg, "../..");

describe("the package documentation of the catalog (FR-026)", () => {
  const readme = readFileSync(join(pkg, "README.md"), "utf8");
  const section = readme.slice(readme.indexOf("## The catalog"), readme.indexOf("## Supported browsers"));

  it("describes the file, the lock, the entry states, store-lost, the three calls, what a full clear looks like and the empty-seed limit", () => {
    for (const word of [
      "relate-web/catalog.json", "relate-web:catalog", "Web Lock", "seeding", "migrating", "importing", "resetting", "loading", "removing",
      "listGraphs", "removeGraph", "resetCatalog", "unregistered", "missing", "locked", "kind-mismatch", "not-a-store",
      "same as a first", "never removes an application graph",
    ]) expect(section, word).toContain(word);
  });

  it("describes store-lost and the empty-seed limit where the failures are listed", () => {
    const application = readme.slice(readme.indexOf("## Application graphs"), readme.indexOf("## The catalog"));
    expect(application).toContain("`store-lost`");
    expect(application).toContain("seed had no");
    expect(application).not.toContain("WHERE NOT n:_RelateApplication");
  });
});

describe("the trace check (FR-027)", () => {
  it("passes statically when every requirement of specification 007 is tagged", () => {
    const run = spawnSync("npx", ["tsx", "tests/catalog/trace/check-trace-catalog.ts", "--static"], { cwd: pkg, encoding: "utf8" });
    expect(run.stderr).not.toContain("ids with no tagged test");
    expect(run.status, run.stderr).toBe(0);
  });
});

describe("the tests FR-023 lists exist, in the unit and the browser suites", () => {
  const files: Array<[string, string]> = [
    ["tests/catalog/browser/tabs.spec.ts", "tabs writing the catalog lose no update; readable beside a held store"],
    ["tests/catalog/browser/lock-release.spec.ts", "a terminated worker or a closed tab frees the lock"],
    ["tests/catalog/unit/classify.test.ts", "every row of the application classification"],
    ["tests/catalog/unit/recovery.test.ts", "interrupted seeding, migration, reset and removal; a failing write changes nothing"],
    ["tests/catalog/browser/recovery.spec.ts", "interrupted seeding, migration, import, reset and removal in the browsers"],
    ["tests/catalog/unit/transfer.test.ts", "the import window no longer seeds over an empty store"],
    ["tests/catalog/browser/first-run.spec.ts", "store-lost after the store is emptied; an empty-seed application opens"],
    ["tests/catalog/browser/cache.spec.ts", "cache restore, rebuild, legacy file removal"],
    ["tests/catalog/browser/list.spec.ts", "list reports unregistered and missing"],
    ["tests/catalog/browser/remove.spec.ts", "remove rejects while held and restores under a concurrent change; a corrupt catalog fails applications and the reset recovers"],
  ];
  it.each(files)("%s: %s", (file) => {
    expect(existsSync(join(pkg, file)), file).toBe(true);
    expect(readFileSync(join(pkg, file), "utf8"), file).toMatch(/covers-cat:/);
  });
});

describe("the decisions are amended and the adapters are not affected (FR-024, FR-025, SC-009)", () => {
  it("records the change in ADR-009 and ADR-003 and notes it in specification 006", () => {
    expect(readFileSync(join(repo, "design/adr/ADR-009-application-graphs-in-the-core.md"), "utf8")).toMatch(/### 2026-11-10, the catalog replaces the marker/);
    expect(readFileSync(join(repo, "design/adr/ADR-009-application-graphs-in-the-core.md"), "utf8")).toContain("`store-lost`");
    expect(readFileSync(join(repo, "design/adr/ADR-003-graph-descriptor.md"), "utf8")).toMatch(/2026-11-10: the stored copy is replaced by the cache's entry/);
    expect(readFileSync(join(repo, "specs/006-application-graphs/spec.md"), "utf8")).toContain("Superseded in part (2026-11-10)");
  });

  it("leaves no adapter source naming the marker, its constants or the stored copy", () => {
    const walk = (dir: string): string[] => readdirSync(dir).flatMap((n) => (n === "node_modules" || n === "dist" ? [] : statSync(join(dir, n)).isDirectory() ? walk(join(dir, n)) : [join(dir, n)]));
    for (const adapter of ["astro", "nextjs", "observable", "sveltekit"]) {
      for (const file of walk(join(repo, "packages", adapter, "src")).filter((f) => /\.(ts|js|svelte|astro|tsx)$/.test(f))) {
        expect(readFileSync(file, "utf8"), file).not.toMatch(/MARKER_LABEL|MARKER_FORMAT|_RelateApplication|stored-copy|STORED_COPY_DIR/);
      }
    }
  });
});
