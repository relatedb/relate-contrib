// covers: FR-018, FR-019, FR-020, FR-021, FR-022, FR-030
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { config, installDocument, stubClient } from "../helpers/stubs.js";

const createClient = vi.fn((_o: unknown) => stubClient());
const createSiteClient = vi.fn((_o: unknown) => stubClient());
vi.mock("@relate/web", () => ({ createClient: (o: unknown) => createClient(o), createSiteClient: (o: unknown) => createSiteClient(o) }));

const registry = await import("../../src/registry.js");
const cfg = config([{ id: "shared", lifetime: "visit" }, { id: "small", lifetime: "page" }, { id: "other", lifetime: "page" }]);

beforeEach(() => {
  vi.useFakeTimers();
  createClient.mockClear();
  createSiteClient.mockClear();
  registry.forgetAll();
  installDocument([]);
});
afterEach(() => vi.useRealTimers());

describe("nothing happens before a holder asks (the server, and a page that uses no helper)", () => {
  it("creates no client when the module is loaded", () => {
    expect(createClient).not.toHaveBeenCalled();
    expect(createSiteClient).not.toHaveBeenCalled();
  });
});

describe("a registered page graph", () => {
  it("is shared by its holders, created once, with the stored copy and the descriptor's location", () => {
    const a = registry.hold(cfg, "small");
    const b = registry.hold(cfg, "small");
    expect(a.client).toBe(b.client);
    expect(createClient).toHaveBeenCalledTimes(1);
    expect(createClient.mock.calls[0]![0]).toMatchObject({ engineUrl: "/engine.wasm", graph: { descriptor: "/relate/small/descriptor.json" }, navigation: "client-routing", store: true });
  });

  it("is destroyed one task after the last holder is released, and not before", () => {
    const a = registry.hold(cfg, "small");
    const b = registry.hold(cfg, "small");
    a.release();
    vi.runAllTimers();
    expect(a.client.destroy).not.toHaveBeenCalled(); // one holder is left
    b.release();
    expect(b.client.destroy).not.toHaveBeenCalled(); // not within the task that released it
    vi.advanceTimersByTime(0);
    expect(b.client.destroy).toHaveBeenCalledTimes(1);
  });

  it("is kept when a new holder arrives in the task after the old one left (consecutive pages)", () => {
    const old = registry.hold(cfg, "small"); // the old page
    old.release(); // SvelteKit destroys the old page first ...
    const next = registry.hold(cfg, "small"); // ... then the new page mounts
    vi.runAllTimers();
    expect(next.client).toBe(old.client);
    expect(old.client.destroy).not.toHaveBeenCalled();
    expect(createClient).toHaveBeenCalledTimes(1);
  });

  it("is destroyed when the next page uses a different page graph, which gets its own client", () => {
    const first = registry.hold(cfg, "small");
    first.release();
    const second = registry.hold(cfg, "other");
    vi.runAllTimers();
    expect(first.client.destroy).toHaveBeenCalledTimes(1);
    expect(second.client.destroy).not.toHaveBeenCalled();
    expect(createClient).toHaveBeenCalledTimes(2);
  });

  it("releases once however often release is called", () => {
    const a = registry.hold(cfg, "small");
    const b = registry.hold(cfg, "small");
    a.release();
    a.release();
    a.release();
    vi.runAllTimers();
    expect(b.client.destroy).not.toHaveBeenCalled();
  });
});

describe("a visit graph", () => {
  it("is created once per id and never destroyed by release", () => {
    const a = registry.hold(cfg, "shared");
    const b = registry.hold(cfg, "shared");
    expect(a.client).toBe(b.client);
    a.release();
    b.release();
    vi.runAllTimers();
    expect(a.client.destroy).not.toHaveBeenCalled();
    expect(createClient).toHaveBeenCalledTimes(1);
  });

  it("is made with the core's site client under multi-page and with a plain client under client-routing", () => {
    registry.hold(config([{ id: "shared", lifetime: "visit" }], "multi-page"), "shared");
    expect(createSiteClient).toHaveBeenCalledTimes(1);
    expect(createClient).not.toHaveBeenCalled();
    registry.hold(cfg, "shared");
    expect(createClient).toHaveBeenCalledTimes(1);
  });
});

describe("an inline graph", () => {
  it("is found before the registered graphs, created with no store and its own indexes", () => {
    installDocument([{ id: "g", document: { version: 1, nodes: [{ id: "a" }], links: [] }, indexes: [{ label: "Item", property: "id" }] }]);
    const held = registry.hold(cfg, "g");
    expect(held.client).toBeDefined();
    const options = createClient.mock.calls[0]![0] as { graph: { document: unknown; indexes: unknown }; store?: boolean };
    expect(options.graph).toEqual({ document: { version: 1, nodes: [{ id: "a" }], links: [] }, indexes: [{ label: "Item", property: "id" }] });
    expect(options.store).toBeUndefined();
  });

  it("is a different client when the page element is a different one, and the earlier client ends by the page rule", () => {
    const first = installDocument([{ id: "g" }]);
    const a = registry.hold(cfg, "g");
    a.release();
    const second = installDocument([{ id: "g" }]);
    const b = registry.hold(cfg, "g");
    expect(first.nodes[0]).not.toBe(second.nodes[0]);
    expect(b.client).not.toBe(a.client);
    vi.runAllTimers();
    expect(a.client.destroy).toHaveBeenCalledTimes(1);
    expect(b.client.destroy).not.toHaveBeenCalled();
  });

  it("wins over a registered id of the same name only when the page has no such registered graph; both is an error", () => {
    installDocument([{ id: "small" }]);
    expect(() => registry.hold(cfg, "small")).toThrow(/"small" is both an inline graph of this page and a registered graph/);
  });
});

describe("an unknown id", () => {
  it("fails naming the id and listing the registered ids", () => {
    expect(() => registry.hold(cfg, "nothing")).toThrow(/no graph with the id "nothing".*\(shared, small, other\)/);
    expect(() => registry.hold(config([]), "nothing")).toThrow(/\(none\)/);
  });
});

describe("a document that ends", () => {
  it("takes its page clients with it, but not a page the browser keeps for the back button, and not a visit client", () => {
    const page = installDocument([]);
    const held = registry.hold(cfg, "small");
    const visit = registry.hold(cfg, "shared");
    page.pagehide(true);
    expect(held.client.destroy).not.toHaveBeenCalled();
    page.pagehide(false);
    expect(held.client.destroy).toHaveBeenCalledTimes(1);
    expect(visit.client.destroy).not.toHaveBeenCalled();
  });
});

describe("a holder whose id changes (what the helper does)", () => {
  it("releases the old graph and acquires the new one", () => {
    const old = registry.hold(cfg, "small");
    old.release();
    const next = registry.hold(cfg, "other");
    vi.runAllTimers();
    expect(old.client.destroy).toHaveBeenCalledTimes(1);
    expect(next.client.destroy).not.toHaveBeenCalled();
  });
});
