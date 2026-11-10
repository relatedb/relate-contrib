// covers-cat: FR-001, FR-002, FR-003, FR-012
import { describe, expect, it } from "vitest";
import { parseCatalog, splitStoreName, validateEntry } from "../../../src/catalog/file.js";

const at = "2026-11-10T09:12:00.000Z";
const app = (over: Record<string, unknown> = {}) => ({ kind: "application", name: "orders", state: "ready", version: 3, seeded: true, updatedAt: at, ...over });
const cache = (over: Record<string, unknown> = {}) => ({ kind: "cache", name: "docs", state: "ready", revision: "9f2c41e", updatedAt: at, ...over });

describe("parseCatalog", () => {
  it("reports no file as missing", () => {
    expect(parseCatalog(null)).toEqual({ status: "missing" });
  });

  it.each([
    ["not JSON", "{not json"],
    ["an array", "[]"],
    ["null", "null"],
    ["no format", JSON.stringify({ graphs: {} })],
    ["format 0", JSON.stringify({ format: 0, graphs: {} })],
    ["a fractional format", JSON.stringify({ format: 1.5, graphs: {} })],
    ["a string format", JSON.stringify({ format: "1", graphs: {} })],
    ["no graphs", JSON.stringify({ format: 1 })],
    ["graphs as an array", JSON.stringify({ format: 1, graphs: [] })],
    ["a truncated file", '{"format": 1, "graphs": {"app-a": {"kind"'],
  ])("reports %s as unreadable", (_name, text) => {
    expect(parseCatalog(text).status).toBe("unreadable");
  });

  it("reports a larger format as newer, with the format", () => {
    expect(parseCatalog(JSON.stringify({ format: 2, graphs: {} }))).toEqual({ status: "newer", format: 2 });
  });

  it("returns the parsed file, unknown fields included", () => {
    const text = JSON.stringify({ format: 1, graphs: { "app-a": app({ name: "a", future: true }) }, extra: 1 });
    const r = parseCatalog(text);
    expect(r.status).toBe("ok");
    if (r.status === "ok") expect((r.file as unknown as { extra: number }).extra).toBe(1);
  });
});

describe("splitStoreName", () => {
  it.each([
    ["app-orders", { kind: "application", name: "orders" }],
    ["rel-docs-site", { kind: "cache", name: "docs-site" }],
  ])("splits %s", (key, parts) => expect(splitStoreName(key)).toEqual(parts));

  it.each(["orders", "app-", "app-a b", `app-${"x".repeat(61)}`, `rel-${"x".repeat(49)}`, "other-x"])("rejects %s", (key) => {
    expect(splitStoreName(key)).toBeNull();
  });
});

describe("validateEntry", () => {
  it("accepts a ready application and a ready cache", () => {
    expect(validateEntry("app-orders", app()).ok).toBe(true);
    expect(validateEntry("rel-docs", cache()).ok).toBe(true);
  });

  it("accepts every application and cache state", () => {
    for (const state of ["ready", "seeding", "importing", "resetting", "removing"]) expect(validateEntry("app-orders", app({ state })).ok).toBe(true);
    expect(validateEntry("app-orders", app({ state: "migrating", target: 4 })).ok).toBe(true);
    for (const state of ["loading", "removing"]) expect(validateEntry("rel-docs", cache({ state, revision: undefined })).ok).toBe(true);
  });

  it("returns the same object so unknown fields survive", () => {
    const raw = app({ future: 1 });
    const r = validateEntry("app-orders", raw);
    expect(r.ok && r.entry).toBe(raw);
  });

  it.each([
    ["not an object", "app-orders", "x"],
    ["a kind that differs from the key", "app-orders", cache({ name: "orders" })],
    ["a name that differs from the key", "app-orders", app({ name: "other" })],
    ["an unknown state", "app-orders", app({ state: "paused" })],
    ["a cache state on an application", "app-orders", app({ state: "loading" })],
    ["an application state on a cache", "rel-docs", cache({ state: "seeding" })],
    ["a version of 0", "app-orders", app({ version: 0 })],
    ["a fractional version", "app-orders", app({ version: 1.5 })],
    ["no version", "app-orders", app({ version: undefined })],
    ["a seeded that is not a boolean", "app-orders", app({ seeded: "yes" })],
    ["a migrating entry with no target", "app-orders", app({ state: "migrating" })],
    ["a migrating entry whose target is not above its version", "app-orders", app({ state: "migrating", target: 3 })],
    ["a target on a ready entry", "app-orders", app({ target: 4 })],
    ["an updatedAt that is not a time", "app-orders", app({ updatedAt: "yesterday" })],
    ["no updatedAt", "rel-docs", cache({ updatedAt: undefined })],
    ["a ready cache with no revision", "rel-docs", cache({ revision: undefined })],
    ["a ready cache with an empty revision", "rel-docs", cache({ revision: "" })],
    ["a revision that is not a string", "rel-docs", cache({ revision: 5 })],
    ["a key that is not a store name", "orders", app()],
  ])("rejects %s", (_name, key, raw) => {
    expect(validateEntry(key, raw).ok).toBe(false);
  });
});
