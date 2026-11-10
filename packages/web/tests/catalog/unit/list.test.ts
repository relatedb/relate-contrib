// covers-cat: FR-018
import { describe, expect, it } from "vitest";
import { reconcile } from "../../../src/catalog/directory.js";
import type { ReadResult } from "../../../src/catalog/types.js";

const at = "2026-11-10T09:00:00.000Z";
const ok = (graphs: Record<string, unknown>): ReadResult => ({ status: "ok", file: { format: 1, graphs } });
const app = (name: string, over: Record<string, unknown> = {}) => ({ kind: "application", name, state: "ready", version: 2, seeded: true, updatedAt: at, ...over });
const cache = (name: string, over: Record<string, unknown> = {}) => ({ kind: "cache", name, state: "ready", revision: "r1", updatedAt: at, ...over });

describe("reconciling the catalog with the directories", () => {
  it("lists each entry with its kind, name, state and version or revision, and whether its store is there", () => {
    const items = reconcile(ok({ "app-orders": app("orders"), "rel-docs": cache("docs") }), ["app-orders", "rel-docs"]);
    expect(items).toEqual([
      { store: "app-orders", kind: "application", name: "orders", state: "ready", version: 2, registered: true, present: true, status: "ok" },
      { store: "rel-docs", kind: "cache", name: "docs", state: "ready", revision: "r1", registered: true, present: true, status: "ok" },
    ]);
  });

  it("reports a directory with no entry as unregistered, naming its kind when the name says it", () => {
    const items = reconcile(ok({}), ["app-stray", "other"]);
    expect(items).toEqual([
      { store: "app-stray", kind: "application", name: "stray", registered: false, present: true, status: "unregistered" },
      { store: "other", registered: false, present: true, status: "unregistered" },
    ]);
  });

  it("reports an entry with no directory as missing", () => {
    const items = reconcile(ok({ "app-gone": app("gone") }), []);
    expect(items).toEqual([{ store: "app-gone", kind: "application", name: "gone", state: "ready", version: 2, registered: true, present: false, status: "missing" }]);
  });

  it("shows an in-progress state as it is", () => {
    const items = reconcile(ok({ "app-a": app("a", { state: "migrating", version: 1, target: 2 }) }), ["app-a"]);
    expect(items[0]).toMatchObject({ state: "migrating", version: 1 });
  });

  it("lists a malformed entry as registered without interpreting it", () => {
    const items = reconcile(ok({ "app-bad": { kind: "application" } }), ["app-bad"]);
    expect(items).toEqual([{ store: "app-bad", kind: "application", name: "bad", registered: true, present: true, status: "ok" }]);
  });

  it("sorts by store name and lists a store once when it is in both", () => {
    const items = reconcile(ok({ "rel-b": cache("b"), "app-a": app("a") }), ["rel-b", "app-a", "app-c"]);
    expect(items.map((i) => i.store)).toEqual(["app-a", "app-c", "rel-b"]);
  });

  it.each<[string, ReadResult]>([
    ["missing", { status: "missing" }],
    ["unreadable", { status: "unreadable", message: "x" }],
    ["newer", { status: "newer", format: 2 }],
  ])("a catalog that is %s lists the directories only, each unregistered", (_name, read) => {
    const items = reconcile(read, ["app-a", "rel-b"]);
    expect(items.map((i) => [i.store, i.status])).toEqual([["app-a", "unregistered"], ["rel-b", "unregistered"]]);
  });

  it("an origin that stored nothing lists nothing", () => {
    expect(reconcile({ status: "missing" }, [])).toEqual([]);
  });
});
