// covers: FR-023
import { beforeEach, describe, expect, it, vi } from "vitest";
import { config, installDocument, stubClient } from "../helpers/stubs.js";

const createClient = vi.fn((_o: unknown) => stubClient());
vi.mock("@relate/contrib-web", () => ({ createClient: (o: unknown) => createClient(o), createSiteClient: (o: unknown) => createClient(o) }));

const { mount } = await import("../../src/context.js");
const { graph } = await import("../../src/use-graph.svelte.js");
const registry = await import("../../src/registry.js");
const cfg = config([{ id: "shared", lifetime: "visit" }, { id: "small", lifetime: "page" }]);

let unmount = () => {};
beforeEach(() => {
  unmount();
  createClient.mockClear();
  registry.forgetAll();
  installDocument([]);
  unmount = mount(cfg);
});

describe("the direct lookup", () => {
  it("returns the client for a visit graph, and the same client when asked again", () => {
    const a = graph("shared");
    expect(a).toBeDefined();
    expect(graph("shared")).toBe(a);
    expect(createClient).toHaveBeenCalledTimes(1);
  });

  it("fails, naming the graph and saying to ask from a component, for a page graph and for an inline graph", () => {
    expect(() => graph("small")).toThrow(/"small" has the "page" lifetime; ask for it from a component with useGraph/);
    installDocument([{ id: "g" }]);
    expect(() => graph("g")).toThrow(/"g" is an inline graph of a page; ask for it from a component with useGraph/);
  });

  it("fails, naming the id and listing the registered ids, for an unknown id", () => {
    expect(() => graph("nothing")).toThrow(/no registered graph with the id "nothing" \(registered: shared, small\)/);
  });

  it("fails before the provider has mounted", () => {
    unmount();
    expect(() => graph("shared")).toThrow(/before RelateProvider mounted/);
  });
});
