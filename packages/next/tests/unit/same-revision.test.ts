// covers: FR-007, FR-026, FR-027, SC-002
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { descriptorOf as astroDescriptorOf, evaluate as astroEvaluate } from "../../../astro/src/sources.js";
import example from "../../../astro/conformance-site/src/graphs/example.js";
import { sized } from "../../conformance-site/lib/documents.js";
import { createGraphRoute } from "../../src/server/route.js";

describe("both adapters, one document", () => {
  it("give the same revision and the same descriptor fields", async () => {
    const astro = astroDescriptorOf("example", await astroEvaluate("example", () => example()), [{ label: "Page", property: "id" }], "");
    const route = createGraphRoute({ example: { source: () => sized(300), indexes: [{ label: "Page", property: "id" }] } });
    const next = await (await route.GET(new Request("http://x/"), { params: Promise.resolve({ id: "example", file: "descriptor.json" }) })).json();
    expect(next.revision).toBe(astro.revision);
    expect(next.data.nodes).toBe(astro.data.nodes);
    expect(next.data.links).toBe(astro.data.links);
    expect(next.indexes).toEqual(astro.indexes);
    expect(next.version).toBe(astro.version);
  });
});

describe("one implementation of the shared build code", () => {
  const walk = (dir: string): string[] => readdirSync(dir).flatMap((n) => (statSync(join(dir, n)).isDirectory() && n !== "node_modules" && n !== "dist" ? walk(join(dir, n)) : n.match(/\.(ts|tsx|astro)$/) ? [join(dir, n)] : []));
  const sources = [...walk(fileURLToPath(new URL("../../src", import.meta.url))), ...walk(fileURLToPath(new URL("../../../astro/src", import.meta.url)))];

  it("keeps no copy of the canonical text, the hash, the descriptor or the inline check in either adapter", () => {
    expect(sources.length).toBeGreaterThan(10);
    for (const file of sources) {
      const text = readFileSync(file, "utf8");
      expect(text, file).not.toMatch(/createHash|crypto\.subtle|const sortKeys|function canonicalText|function escapeJson|function checkInline/);
    }
  });
});
