// The canonical text of a graph document and its revision (ADR-004 §2.2, ADR-005 §2.2). Runtime-neutral: the hash is
// Web Crypto's SHA-256, available in browsers and in Node, so the revision is the same wherever it is computed.
import type { GraphDocument } from "../validate.js";

const sortKeys = (value: unknown): unknown => {
  if (Array.isArray(value)) return value.map(sortKeys); // the order of an array property is data
  if (value !== null && typeof value === "object") {
    return Object.fromEntries(
      Object.keys(value as object)
        .sort()
        .map((k) => [k, sortKeys((value as Record<string, unknown>)[k])]),
    );
  }
  return value;
};

/** The document as text that does not depend on the order of keys, nodes or links; any `revision` it carries is dropped. */
export function canonicalText(document: GraphDocument): string {
  const nodes = [...document.nodes].map((n) => sortKeys(n) as GraphDocument["nodes"][number]).sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  const key = (l: GraphDocument["links"][number]) => JSON.stringify([l.source, l.target, l.type, sortKeys(l.properties ?? {})]);
  const links = [...document.links].map((l) => sortKeys(l) as GraphDocument["links"][number]).sort((a, b) => (key(a) < key(b) ? -1 : key(a) > key(b) ? 1 : 0));
  return JSON.stringify({ version: 1, nodes, links });
}

/** The first 12 hexadecimal digits of the SHA-256 of the canonical text. */
export async function revisionOf(text: string): Promise<string> {
  const digest = await globalThis.crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  let hex = "";
  for (const byte of new Uint8Array(digest).subarray(0, 6)) hex += byte.toString(16).padStart(2, "0");
  return hex;
}
