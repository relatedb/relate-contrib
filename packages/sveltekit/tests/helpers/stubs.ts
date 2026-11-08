// Stand-ins for the core's client and for the page, for unit tests of the registry and the helpers.
import { vi } from "vitest";

export function stubClient() {
  return { destroy: vi.fn(), status: "ready", marker: Math.random() };
}

export type StubClient = ReturnType<typeof stubClient>;

/** A catalog entry list and the provider's configuration around it. */
export const config = (catalog: Array<{ id: string; lifetime: "page" | "visit" }>, profile: "client-routing" | "multi-page" = "client-routing", engineUrl = "/engine.wasm") => ({
  catalog: catalog.map((g) => ({ ...g, indexes: [] as Array<{ label: string; property: string }> })),
  engineUrl,
  profile,
  renderIds: new Set<string>(),
});

/** A page whose document holds the given inline-graph elements. */
export function installDocument(elements: Array<{ id: string; document?: unknown; indexes?: Array<{ label: string; property: string }>; visible?: boolean }> = []) {
  const nodes = elements.map((e) => ({
    getAttribute: (name: string) => (name === "data-relate-graph" ? e.id : null),
    textContent: JSON.stringify({ document: e.document ?? { version: 1, nodes: [], links: [] }, config: e.indexes ? { indexes: e.indexes } : {} }),
    parentElement: { checkVisibility: () => e.visible ?? true },
  }));
  const target = new EventTarget();
  Object.assign(globalThis, {
    document: { querySelectorAll: () => nodes },
    addEventListener: target.addEventListener.bind(target),
    removeEventListener: target.removeEventListener.bind(target),
  });
  return {
    nodes,
    pagehide: (persisted = false) => target.dispatchEvent(Object.assign(new Event("pagehide"), { persisted })),
  };
}
