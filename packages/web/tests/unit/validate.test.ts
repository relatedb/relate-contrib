// covers: FR-013, FR-014, FR-018, SC-006
import { describe, expect, it } from "vitest";
import { validate } from "../../src/validate.js";
import { corpus, schemaValidator } from "./helpers.js";

const schema = schemaValidator("graph-data.schema.json");

// Rules a JSON Schema cannot express: the schema accepts these, the validator must still reject them.
const SEMANTIC = new Set(["node-duplicate-id.json", "link-source-missing-node.json", "link-target-missing-node.json"]);

describe("the data-document validator", () => {
  for (const { name, value } of corpus("documents/valid")) {
    it(`accepts valid/${name} and agrees with the schema`, () => {
      const result = validate(value);
      expect(result.ok).toBe(true);
      expect(schema(value)).toBe(true);
    });
  }

  for (const { name, value, path } of corpus("documents/invalid")) {
    it(`rejects invalid/${name} at ${path}`, () => {
      const result = validate(value);
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.path).toBe(path);
      if (!SEMANTIC.has(name)) expect(schema(value)).toBe(false);
    });
  }

  for (const { name, value, path } of corpus("documents/invalid-scoped")) {
    it(`rejects invalid-scoped/${name} only when the load is scoped`, () => {
      expect(validate(value).ok).toBe(true);
      const scoped = validate(value, { scoped: true });
      expect(scoped.ok).toBe(false);
      if (!scoped.ok) expect(scoped.path).toBe(path);
    });
  }

  it("rejects anything that is not an object, with the empty path", () => {
    for (const bad of [null, 1, "x", [], undefined]) {
      const result = validate(bad);
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.path).toBe("");
    }
  });

  it("rejects numbers that are not finite", () => {
    const result = validate({ version: 1, nodes: [{ id: "a", properties: { x: Infinity } }], links: [] });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.path).toBe("nodes[0].properties.x");
  });

  it("returns the document itself when it is valid", () => {
    const doc = { version: 1, nodes: [], links: [] };
    const result = validate(doc);
    expect(result.ok && result.document).toBe(doc);
  });
});
