// Validator for the node-link graph data document (ADR-002). No browser APIs: usable in a build step or in Node.
import type { GraphDocument } from "./types.js";

export type ValidationResult = { ok: true; document: GraphDocument } | { ok: false; path: string; message: string };

export class Problem extends Error {
  readonly path: string;
  constructor(path: string, message: string) {
    super(message);
    this.name = "Problem";
    this.path = path;
  }
}

export const isObject = (v: unknown): v is Record<string, unknown> =>
  typeof v === "object" && v !== null && !Array.isArray(v);

export const isNonEmptyString = (v: unknown): v is string => typeof v === "string" && v !== "";

const finite = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);

/** A property value is "string, finite number, boolean, or a non-empty array of one of those kinds". */
function checkPropertyValue(value: unknown, path: string): void {
  if (typeof value === "string" || typeof value === "boolean" || finite(value)) return;
  if (Array.isArray(value)) {
    if (value.length === 0) throw new Problem(path, "an empty array is not a value; leave the property out");
    if (value.every((v) => typeof v === "string")) return;
    if (value.every(finite)) return;
    if (value.every((v) => typeof v === "boolean")) return;
    throw new Problem(path, "an array must hold only strings, only finite numbers or only booleans");
  }
  throw new Problem(path, "a property value must be a string, a finite number, a boolean or a non-empty array of one kind");
}

function checkProperties(value: unknown, path: string, options: { reserved: string[] }): void {
  if (!isObject(value)) throw new Problem(path, "properties must be an object");
  for (const [key, v] of Object.entries(value)) {
    const keyPath = `${path}.${key}`;
    if (options.reserved.includes(key)) throw new Problem(keyPath, `"${key}" is reserved and cannot be a property`);
    checkPropertyValue(v, keyPath);
  }
}

function checkNode(node: unknown, path: string, ids: Set<string>, scoped: boolean): void {
  if (!isObject(node)) throw new Problem(path, "a node must be an object");
  for (const key of Object.keys(node)) {
    if (key !== "id" && key !== "labels" && key !== "properties") throw new Problem(`${path}.${key}`, `unknown key "${key}"`);
  }
  if (!isNonEmptyString(node.id)) throw new Problem(`${path}.id`, "a node id must be a non-empty string");
  if (ids.has(node.id)) throw new Problem(`${path}.id`, `duplicate node id "${node.id}"`);
  ids.add(node.id);
  if ("labels" in node) {
    if (!Array.isArray(node.labels)) throw new Problem(`${path}.labels`, "labels must be an array");
    const seen = new Set<string>();
    node.labels.forEach((label, j) => {
      if (!isNonEmptyString(label)) throw new Problem(`${path}.labels[${j}]`, "a label must be a non-empty string");
      if (seen.has(label)) throw new Problem(`${path}.labels[${j}]`, `duplicate label "${label}"`);
      seen.add(label);
    });
  }
  if ("properties" in node) {
    checkProperties(node.properties, `${path}.properties`, { reserved: scoped ? ["id", "scope"] : ["id"] });
  }
}

function checkLink(link: unknown, path: string, ids: Set<string>): void {
  if (!isObject(link)) throw new Problem(path, "a link must be an object");
  for (const key of Object.keys(link)) {
    if (!["source", "target", "type", "properties"].includes(key)) throw new Problem(`${path}.${key}`, `unknown key "${key}"`);
  }
  for (const end of ["source", "target"] as const) {
    const id = link[end];
    if (!isNonEmptyString(id)) throw new Problem(`${path}.${end}`, `a link ${end} must be a node id`);
    if (!ids.has(id)) throw new Problem(`${path}.${end}`, `the ${end} "${id}" names no node in the document`);
  }
  if (!isNonEmptyString(link.type)) throw new Problem(`${path}.type`, "a link type must be a non-empty string");
  if ("properties" in link) checkProperties(link.properties, `${path}.properties`, { reserved: [] });
}

/**
 * Check a graph data document. Reports the path of the first problem, for example `nodes[3].properties.id`.
 * With `scoped: true` a `scope` property on a node is also an error (a scoped load adds it itself).
 */
export function validate(input: unknown, opts: { scoped?: boolean } = {}): ValidationResult {
  try {
    if (!isObject(input)) throw new Problem("", "a graph data document must be an object");
    for (const key of Object.keys(input)) {
      if (!["version", "revision", "nodes", "links"].includes(key)) throw new Problem(key, `unknown key "${key}"`);
    }
    if (input.version !== 1) {
      throw new Problem("version", input.version === undefined ? "version is required" : `unknown format version ${String(input.version)}`);
    }
    if ("revision" in input && !isNonEmptyString(input.revision)) throw new Problem("revision", "revision must be a non-empty string");
    if (!Array.isArray(input.nodes)) throw new Problem("nodes", "nodes must be an array");
    if (!Array.isArray(input.links)) throw new Problem("links", "links must be an array");
    const ids = new Set<string>();
    input.nodes.forEach((n, i) => checkNode(n, `nodes[${i}]`, ids, opts.scoped === true));
    input.links.forEach((l, i) => checkLink(l, `links[${i}]`, ids));
    return { ok: true, document: input as unknown as GraphDocument };
  } catch (e) {
    if (e instanceof Problem) return { ok: false, path: e.path, message: e.message };
    throw e;
  }
}
