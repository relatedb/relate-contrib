// covers-ra: FR-021
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { validate } from "@relate/contrib-web/validate";
import { makeSeed } from "../../scripts/make-seed.js";

const committed = JSON.parse(readFileSync(new URL("../../src/seed.json", import.meta.url), "utf8")) as ReturnType<typeof makeSeed>;

describe("the demo's seed", () => {
  it("is accepted by the core's validation (ADR-002)", () => {
    const checked = validate(committed);
    expect(checked.ok, JSON.stringify(checked)).toBe(true);
  });

  it("has 6 companies, 50 people and 10 projects with unique string ids", () => {
    const count = (label: string) => committed.nodes.filter((n) => n.labels.includes(label)).length;
    expect([count("Company"), count("Person"), count("Project")]).toEqual([6, 50, 10]);
    const ids = committed.nodes.map((n) => n.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(ids.every((id) => typeof id === "string")).toBe(true);
  });

  it("gives every person one WORKS_AT and every project one OWNED_BY and one LED_BY, to nodes that exist", () => {
    const labels = new Map(committed.nodes.map((n) => [n.id, n.labels[0]]));
    const outgoing = (id: string, type: string) => committed.links.filter((l) => l.source === id && l.type === type);
    for (const n of committed.nodes) {
      if (n.labels[0] === "Person") {
        const l = outgoing(n.id, "WORKS_AT");
        expect(l).toHaveLength(1);
        expect(labels.get(l[0]!.target)).toBe("Company");
      }
      if (n.labels[0] === "Project") {
        const owned = outgoing(n.id, "OWNED_BY");
        const led = outgoing(n.id, "LED_BY");
        expect(owned).toHaveLength(1);
        expect(led).toHaveLength(1);
        expect(labels.get(owned[0]!.target)).toBe("Company");
        expect(labels.get(led[0]!.target)).toBe("Person");
      }
    }
  });

  it("is the same every time it is generated, and the committed file is that output", () => {
    expect(JSON.stringify(makeSeed())).toBe(JSON.stringify(makeSeed()));
    expect(committed).toEqual(makeSeed());
  });

  it("uses only string, number and boolean properties, so an export needs no allowLoss", () => {
    for (const n of committed.nodes) {
      for (const v of Object.values(n.properties)) expect(["string", "number", "boolean"]).toContain(typeof v);
    }
  });
});
