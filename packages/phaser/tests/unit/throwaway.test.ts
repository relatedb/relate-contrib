// covers-ph: FR-013
import type { GraphDocument } from "@relate/web";
import { describe, expect, it, vi } from "vitest";

const created: unknown[] = [];
vi.mock("@relate/web", async (importOriginal) => {
  const original = await importOriginal<typeof import("@relate/web")>();
  return {
    ...original,
    createClient: vi.fn((options: unknown) => {
      created.push(options);
      return { made: true };
    }),
  };
});

const { createThrowawayClient } = await import("../../src/index.js");
const doc = { nodes: [{ id: "a", labels: ["N"], properties: {} }], links: [] } as unknown as GraphDocument;
const base = { engineUrl: "engine.wasm", navigation: "multi-page" } as const;

describe("the throwaway client", () => {
  it("is made from a graph given as data, with no store and no application", () => {
    const client = createThrowawayClient(base, doc) as unknown as { made: boolean };
    expect(client.made).toBe(true);
    expect(created).toHaveLength(1);
    expect(created[0]).toEqual({ ...base, graph: { document: doc }, store: false });
    expect(created[0]).not.toHaveProperty("application");
  });

  it("refuses an application, a graph or a store before any client is made", () => {
    created.length = 0;
    expect(() => createThrowawayClient({ ...base, application: { name: "x", version: 1 } } as never, doc)).toThrow(TypeError);
    expect(() => createThrowawayClient({ ...base, graph: { document: doc } } as never, doc)).toThrow(TypeError);
    expect(() => createThrowawayClient({ ...base, store: true } as never, doc)).toThrow(TypeError);
    expect(created).toHaveLength(0);
  });

  it("refuses an application, a graph and a store in its types", () => {
    expect(() =>
      // @ts-expect-error an application opens a store
      createThrowawayClient({ ...base, application: { name: "x", version: 1 } }, doc),
    ).toThrow(TypeError);
  });
});
