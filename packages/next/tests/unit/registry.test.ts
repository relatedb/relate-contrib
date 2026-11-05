// covers: FR-019, FR-020, FR-021, FR-022, FR-023
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const made: Array<{ kind: string; options: Record<string, unknown>; destroy: ReturnType<typeof vi.fn> }> = [];
vi.mock("related-web-core", () => {
  const make = (kind: string) => (options: Record<string, unknown>) => {
    const client = { kind, options, destroy: vi.fn() };
    made.push(client);
    return client;
  };
  return { createClient: make("client"), createSiteClient: make("site") };
});

const { hold, visitGraph } = await import("../../src/client/registry.js");

const catalog = {
  graphs: [
    { id: "shared", descriptor: "/related-web/shared/descriptor.json", lifetime: "visit" as const, indexes: [] },
    { id: "local", descriptor: "/related-web/local/descriptor.json", lifetime: "page" as const, indexes: [] },
    { id: "other", descriptor: "/related-web/other/descriptor.json", lifetime: "page" as const, indexes: [] },
  ],
};
const config = { catalog, engineUrl: "engine.wasm", profile: "client-routing" as const };

type Stub = { getAttribute(): string; textContent: string; parentElement: { checkVisibility(): boolean } };
const element = (name: string, text: string): Stub => ({ getAttribute: () => name, textContent: text, parentElement: { checkVisibility: () => true } });
let inlineElements: Stub[] = [];
beforeEach(() => {
  made.length = 0;
  inlineElements = [];
  vi.useFakeTimers();
  (globalThis as unknown as { document: unknown }).document = {
    querySelectorAll: () => inlineElements,
  };
});
afterEach(() => {
  vi.useRealTimers();
  delete (globalThis as unknown as { document?: unknown }).document;
});

describe("page-lifetime graphs", () => {
  it("are shared by holders, and destroyed one task after the last holder is released", () => {
    const a = hold(config, "local");
    const b = hold(config, "local");
    expect(a.client).toBe(b.client);
    expect(made).toHaveLength(1);
    expect(made[0]!.options).toMatchObject({ engineUrl: "engine.wasm", graph: { descriptor: "/related-web/local/descriptor.json" }, navigation: "client-routing", store: true });
    a.release();
    vi.runAllTimers();
    expect(made[0]!.destroy).not.toHaveBeenCalled();
    b.release();
    expect(made[0]!.destroy).not.toHaveBeenCalled(); // not within the same task
    vi.runAllTimers();
    expect(made[0]!.destroy).toHaveBeenCalledTimes(1);
  });

  it("survive a release and a hold in one task (React's development double mount) and are made once", () => {
    const first = hold(config, "local");
    first.release();
    const second = hold(config, "local");
    vi.runAllTimers();
    expect(made).toHaveLength(1);
    expect(second.client).toBe(first.client);
    expect(made[0]!.destroy).not.toHaveBeenCalled();
    second.release();
    vi.runAllTimers();
    expect(made[0]!.destroy).toHaveBeenCalledTimes(1);
  });

  it("are made anew by a holder that arrives after the client was destroyed, and a double release counts once", () => {
    const first = hold(config, "local");
    first.release();
    first.release();
    vi.runAllTimers();
    const again = hold(config, "local");
    expect(made).toHaveLength(2);
    expect(again.client).not.toBe(first.client);
    again.release();
  });

  it("do not share a client between two graphs", () => {
    const a = hold(config, "local");
    const b = hold(config, "other");
    expect(a.client).not.toBe(b.client);
    a.release();
    b.release();
    vi.runAllTimers();
    expect(made.every((c) => c.destroy.mock.calls.length === 1)).toBe(true);
  });
});

describe("departure of the document", () => {
  it("destroys every page client at once on pagehide, and leaves visit clients alone", () => {
    const listeners: Array<() => void> = [];
    (globalThis as unknown as { addEventListener: unknown }).addEventListener = (type: string, fn: () => void) => type === "pagehide" && listeners.push(fn);
    try {
      hold(config, "shared", { descriptor: "/another-visit.json" }); // a visit client of its own, apart from the other tests'
      hold(config, "local");
      const gone = hold(config, "other");
      gone.release(); // waiting for its task
      expect(listeners.length).toBeGreaterThan(0);
      listeners.forEach((fn) => fn());
      const byKind = made.map((c) => c.destroy.mock.calls.length);
      expect(byKind).toEqual([0, 1, 1]);
      vi.runAllTimers();
      expect(made.map((c) => c.destroy.mock.calls.length)).toEqual([0, 1, 1]); // no second destroy
    } finally {
      delete (globalThis as unknown as { addEventListener?: unknown }).addEventListener;
    }
  });
});

describe("visit-lifetime graphs", () => {
  it("are made once and never destroyed by release", () => {
    const a = hold(config, "shared");
    a.release();
    vi.runAllTimers();
    const b = hold(config, "shared");
    expect(b.client).toBe(a.client);
    expect(made).toHaveLength(1);
    expect(made[0]!.destroy).not.toHaveBeenCalled();
    expect(visitGraph(config, "shared")).toBe(a.client);
  });

  it("use the site client under multi-page and the plain client under client-routing", () => {
    hold({ ...config, profile: "multi-page" }, "shared");
    expect(made.map((c) => c.kind)).toEqual(["site"]);
  });
});

describe("inline graphs", () => {
  const payload = JSON.stringify({ document: { version: 1, nodes: [], links: [] }, config: { indexes: [{ label: "X", property: "id" }] } });

  it("are found before the catalog, made without a store, shared by holders and destroyed by the same rule", () => {
    inlineElements = [element("notebook", payload)];
    const a = hold(config, "notebook");
    const b = hold(config, "notebook");
    expect(a.client).toBe(b.client);
    expect(made[0]!.options).toMatchObject({ graph: { document: { version: 1 }, indexes: [{ label: "X", property: "id" }] } });
    expect("store" in made[0]!.options).toBe(false);
    a.release();
    b.release();
    vi.runAllTimers();
    expect(made[0]!.destroy).toHaveBeenCalledTimes(1);
  });

  it("are a new client when the name is the same and the element is another", () => {
    inlineElements = [element("recipe", payload)];
    const first = hold(config, "recipe");
    first.release();
    vi.runAllTimers();
    inlineElements = [element("recipe", payload)]; // another element, as the next page's
    const second = hold(config, "recipe");
    expect(second.client).not.toBe(first.client);
    second.release();
  });
});

describe("lookup errors", () => {
  it("names an unknown graph and lists the registered names", () => {
    expect(() => hold(config, "nope")).toThrow('no graph named "nope" in this page or among the registered graphs (shared, local, other)');
  });

  it("the direct lookup refuses a page graph, an inline graph and an unknown name, and a call before the provider", () => {
    expect(() => visitGraph(config, "local")).toThrow(/"local" has the "page" lifetime; ask for it from a component/);
    inlineElements = [element("notebook", "{}")];
    expect(() => visitGraph(config, "notebook")).toThrow(/"notebook" is an inline graph of a page; ask for it from a component/);
    expect(() => visitGraph(config, "nope")).toThrow(/no registered graph named "nope" \(registered: shared, local, other\)/);
    expect(() => visitGraph(null, "shared")).toThrow(/before the provider mounted/);
  });
});

describe("testing aids", () => {
  it("the profile override changes only the profile, and the descriptor override only the location", () => {
    hold(config, "local", { navigation: "multi-page" });
    expect(made[0]!.options).toMatchObject({ navigation: "multi-page", graph: { descriptor: "/related-web/local/descriptor.json" }, store: true });
    hold(config, "other", { descriptor: "/elsewhere.json" });
    expect(made[1]!.options).toMatchObject({ navigation: "client-routing", graph: { descriptor: "/elsewhere.json" }, store: true });
  });
});
