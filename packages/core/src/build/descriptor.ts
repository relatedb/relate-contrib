// The ADR-003 descriptor of an evaluated graph.
import type { IndexSpec } from "../validate.js";
import type { Evaluated } from "./prepare.js";

/** The base path of a site joined with a path of the adapter's, without a doubled slash. */
export const withBase = (base: string, path: string): string => `${base.replace(/\/+$/, "")}${path}`;

/** `dataPath` is the published location of the data file, without the base path. */
export function descriptorOf(name: string, evaluated: Evaluated, indexes: IndexSpec[], base: string, dataPath: string) {
  return {
    version: 1 as const,
    id: name,
    revision: evaluated.revision,
    data: { url: withBase(base, dataPath), nodes: evaluated.nodes, links: evaluated.links },
    ...(indexes.length ? { indexes } : {}),
  };
}
