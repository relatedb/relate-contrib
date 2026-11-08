// covers: FR-010, FR-011
import { afterEach, describe, expect, it, vi } from "vitest";
import { catalog } from "../../src/server/catalog.js";

const source = () => ({ version: 1 as const, nodes: [], links: [] });
afterEach(() => vi.unstubAllEnvs());

describe("the catalog", () => {
  it("is plain data with the id, descriptor location, lifetime and indexes", () => {
    const c = catalog({ shared: { source, lifetime: "visit", indexes: [{ label: "Page", property: "id" }] }, local: { source } });
    expect(JSON.parse(JSON.stringify(c))).toEqual(c);
    expect(c.graphs).toEqual([
      { id: "shared", descriptor: "/relate/shared/descriptor.json", lifetime: "visit", indexes: [{ label: "Page", property: "id" }] },
      { id: "local", descriptor: "/relate/local/descriptor.json", lifetime: "page", indexes: [] },
    ]);
  });

  it("includes the base path in the descriptor location", () => {
    vi.stubEnv("RELATE_NEXTJS_BASE_PATH", "/docs/");
    expect(catalog({ g: { source } }).graphs[0]!.descriptor).toBe("/docs/relate/g/descriptor.json");
  });
});
