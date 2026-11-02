// Validator for the graph descriptor (ADR-003) and the check that a descriptor and its data document agree.
import { ID_PATTERN } from "../config.js";
import type { Descriptor, GraphDocument } from "./types.js";
import { isNonEmptyString, isObject, Problem } from "./validate.js";

export type DescriptorValidationResult =
  | { ok: true; descriptor: Descriptor }
  | { ok: false; path: string; message: string };

export type AgreementResult = { ok: true } | { ok: false; path: string; message: string };

const isCount = (v: unknown): v is number => typeof v === "number" && Number.isInteger(v) && v >= 0;

/** Check a descriptor. Reports the path of the first problem, for example `data.nodes`. */
export function validateDescriptor(input: unknown): DescriptorValidationResult {
  try {
    if (!isObject(input)) throw new Problem("", "a descriptor must be an object");
    for (const key of Object.keys(input)) {
      if (key === "shape" || key === "embeddings") throw new Problem(key, `"${key}" is reserved and not defined in version 1`);
      if (!["version", "id", "revision", "data", "indexes"].includes(key)) throw new Problem(key, `unknown key "${key}"`);
    }
    if (input.version !== 1) {
      throw new Problem("version", input.version === undefined ? "version is required" : `unknown descriptor version ${String(input.version)}`);
    }
    if (typeof input.id !== "string" || !ID_PATTERN.test(input.id)) {
      throw new Problem("id", "id must be 1 to 48 characters from A-Z a-z 0-9 _ -");
    }
    if (!isNonEmptyString(input.revision)) throw new Problem("revision", "revision must be a non-empty string");

    const data = input.data;
    if (!isObject(data)) throw new Problem("data", "data must be an object");
    for (const key of Object.keys(data)) {
      if (!["url", "nodes", "links"].includes(key)) throw new Problem(`data.${key}`, `unknown key "${key}"`);
    }
    if (!isNonEmptyString(data.url)) throw new Problem("data.url", "data.url must be a non-empty string");
    if (!isCount(data.nodes)) throw new Problem("data.nodes", "data.nodes must be a non-negative integer");
    if (!isCount(data.links)) throw new Problem("data.links", "data.links must be a non-negative integer");

    if ("indexes" in input) {
      if (!Array.isArray(input.indexes)) throw new Problem("indexes", "indexes must be an array");
      input.indexes.forEach((spec: unknown, i: number) => {
        const path = `indexes[${i}]`;
        if (!isObject(spec)) throw new Problem(path, "an index must be an object");
        for (const key of Object.keys(spec)) {
          if (key !== "label" && key !== "property") throw new Problem(`${path}.${key}`, `unknown key "${key}"`);
        }
        if (!isNonEmptyString(spec.label)) throw new Problem(`${path}.label`, "label must be a non-empty string");
        if (!isNonEmptyString(spec.property)) throw new Problem(`${path}.property`, "property must be a non-empty string");
      });
    }
    return { ok: true, descriptor: input as unknown as Descriptor };
  } catch (e) {
    if (e instanceof Problem) return { ok: false, path: e.path, message: e.message };
    throw e;
  }
}

/** A data document's `revision` (when it has one) and counts must equal the descriptor's (ADR-003 2.2). */
export function checkAgreement(descriptor: Descriptor, document: GraphDocument): AgreementResult {
  if (document.revision !== undefined && document.revision !== descriptor.revision) {
    return { ok: false, path: "revision", message: `the data's revision "${document.revision}" differs from the descriptor's "${descriptor.revision}"` };
  }
  if (document.nodes.length !== descriptor.data.nodes) {
    return { ok: false, path: "nodes", message: `the data has ${document.nodes.length} nodes but the descriptor says ${descriptor.data.nodes}` };
  }
  if (document.links.length !== descriptor.data.links) {
    return { ok: false, path: "links", message: `the data has ${document.links.length} links but the descriptor says ${descriptor.data.links}` };
  }
  return { ok: true };
}
