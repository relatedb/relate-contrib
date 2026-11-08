// covers: FR-013, FR-037, FR-039, SC-006
import { describe, expect, it } from "vitest";
import { checkAgreement, validateDescriptor } from "../../src/data/descriptor.js";
import type { Descriptor, GraphDocument } from "../../src/data/types.js";
import { corpus, schemaValidator } from "./helpers.js";

const schema = schemaValidator("graph-descriptor.schema.json");

describe("the descriptor validator", () => {
  for (const { name, value } of corpus("descriptors/valid")) {
    it(`accepts valid/${name} and agrees with the schema`, () => {
      expect(validateDescriptor(value).ok).toBe(true);
      expect(schema(value)).toBe(true);
    });
  }

  for (const { name, value, path } of corpus("descriptors/invalid")) {
    it(`rejects invalid/${name} at ${path}`, () => {
      const result = validateDescriptor(value);
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.path).toBe(path);
      expect(schema(value)).toBe(false);
    });
  }

  it("rejects anything that is not an object, with the empty path", () => {
    for (const bad of [null, 1, [], undefined]) {
      const result = validateDescriptor(bad);
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.path).toBe("");
    }
  });
});

describe("agreement between a descriptor and its data", () => {
  const descriptor: Descriptor = { version: 1, id: "g", revision: "r1", data: { url: "g.json", nodes: 2, links: 1 } };
  const document = (over: Partial<GraphDocument> = {}): GraphDocument => ({
    version: 1,
    nodes: [{ id: "a" }, { id: "b" }],
    links: [{ source: "a", target: "b", type: "T" }],
    ...over,
  });

  it("agrees when the counts match and there is no revision", () => {
    expect(checkAgreement(descriptor, document()).ok).toBe(true);
  });

  it("agrees when the revisions are equal", () => {
    expect(checkAgreement(descriptor, document({ revision: "r1" })).ok).toBe(true);
  });

  it("rejects a differing revision", () => {
    const result = checkAgreement(descriptor, document({ revision: "r0" }));
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.path).toBe("revision");
  });

  it("rejects a differing node count", () => {
    const result = checkAgreement(descriptor, document({ nodes: [{ id: "a" }] }));
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.path).toBe("nodes");
  });

  it("rejects a differing link count", () => {
    const result = checkAgreement(descriptor, document({ links: [] }));
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.path).toBe("links");
  });
});
