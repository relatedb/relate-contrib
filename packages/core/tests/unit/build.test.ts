// covers-003: FR-026, FR-027, FR-007, SC-002 (specs/003-next-adapter; the core's own trace check reads only "covers:")
import { createHash } from "node:crypto";
import { readdirSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { canonicalText, checkInline, descriptorOf, escapeJson, evaluate, prepare, revisionOf, withBase } from "../../src/build/index.js";

const doc = (over: Record<string, unknown> = {}) => ({
  version: 1,
  nodes: [
    { id: "b", labels: ["X"], properties: { z: 1, a: [3, 1, 2] } },
    { id: "a", labels: ["X"] },
  ],
  links: [
    { source: "b", target: "a", type: "T" },
    { source: "a", target: "b", type: "T", properties: { w: 2 } },
  ],
  ...over,
});

describe("related-web-core/build", () => {
  it("canonicalText is the same for another order of keys, nodes and links, and drops a carried revision", () => {
    const reordered = { links: [...doc().links].reverse(), nodes: [...doc().nodes].reverse(), version: 1 };
    expect(canonicalText(reordered as never)).toBe(canonicalText(doc() as never));
    expect(canonicalText(doc({ revision: "mine" }) as never)).not.toContain("mine");
  });

  it("revisionOf is 12 hex digits and equals the node:crypto SHA-256 prefix", async () => {
    const text = canonicalText(doc() as never);
    const revision = await revisionOf(text);
    expect(revision).toMatch(/^[0-9a-f]{12}$/);
    expect(revision).toBe(createHash("sha256").update(text).digest("hex").slice(0, 12));
  });

  it("prepare gives equal revisions for equal content and different ones for a changed property", async () => {
    const a = await prepare("owner", "g", doc());
    expect((await prepare("owner", "g", { ...doc(), nodes: [...doc().nodes].reverse() })).revision).toBe(a.revision);
    const changed = doc({ nodes: [{ id: "b", labels: ["X"], properties: { z: 2, a: [3, 1, 2] } }, { id: "a", labels: ["X"] }] });
    expect((await prepare("owner", "g", changed)).revision).not.toBe(a.revision);
    expect(a.nodes).toBe(2);
    expect(a.links).toBe(2);
  });

  it("prepare and evaluate name the owner, the graph and the first problem's path", async () => {
    await expect(prepare("related-web-x", "g", doc({ nodes: [{ id: "a" }, { id: "a" }] }))).rejects.toThrow(/^related-web-x: graph "g": nodes\[1\]/);
    await expect(evaluate("related-web-x", "g", () => { throw new Error("boom"); })).rejects.toThrow('related-web-x: graph "g": the source failed: boom');
  });

  it("descriptorOf joins the base path without a doubled slash", async () => {
    const evaluated = await prepare("o", "g", doc());
    const d = descriptorOf("g", evaluated, [], "/base/", "/related-web/g/graph.x.json");
    expect(d.data.url).toBe("/base/related-web/g/graph.x.json");
    expect(d).toMatchObject({ version: 1, id: "g", revision: evaluated.revision });
    expect("indexes" in d).toBe(false);
    expect(withBase("", "/p")).toBe("/p");
  });

  it("checkInline rejects bad input naming the owner and the page", () => {
    const check = (id: string, document: unknown = doc(), config?: object, seen = new Set<string>(), registered: string[] = []) => checkInline("o", "/p", id, document, config, seen, registered);
    expect(check("ok").document.nodes).toHaveLength(2);
    expect(() => check("ok", doc({ nodes: [{ id: "a" }, { id: "a" }] }))).toThrow(/^o: \/p: inline graph "ok": nodes\[1\]/);
    expect(() => check("ok", doc(), { colour: 1 })).toThrow("config.colour: unknown setting");
    expect(() => check("ok", doc(), {}, new Set(["ok"]))).toThrow("used twice");
    expect(() => check("ok", doc(), {}, new Set(), ["ok"])).toThrow("also a registered graph");
    expect(() => check("Bad Id")).toThrow(/inline graph "Bad Id"/);
  });

  it("escapeJson keeps a script element from closing", () => {
    const text = escapeJson({ s: "</script><!-- & \u2028 \u2029" });
    expect(text).not.toMatch(new RegExp("[<>&\\u2028\\u2029]"));
    expect(JSON.parse(text).s).toBe("</script><!-- & \u2028 \u2029");
  });

  it("imports no node: module and no other package", () => {
    const dir = fileURLToPath(new URL("../../src/build/", import.meta.url));
    for (const file of readdirSync(dir)) {
      const imports = [...readFileSync(dir + file, "utf8").matchAll(/from "([^"]+)"/g)].map((m) => m[1]!);
      for (const spec of imports) expect(spec.startsWith("."), `${file} imports ${spec}`).toBe(true);
    }
  });
});
