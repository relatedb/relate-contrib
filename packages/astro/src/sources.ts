// Evaluating a registered graph's source for this adapter (spec FR-006 to FR-009). The canonical text, revision, document
// preparation and descriptor construction live in `@relate/web/build`; this file binds them to the adapter's name and paths.
import { descriptorOf as coreDescriptorOf, evaluate as coreEvaluate, prepare as corePrepare } from "@relate/web/build";
import type { Evaluated } from "@relate/web/build";
import type { IndexSpec } from "@relate/web/validate";

export { canonicalText, revisionOf, withBase } from "@relate/web/build";
export type { Evaluated } from "@relate/web/build";

const OWNER = "@relate/astro";

export const prepare = (name: string, raw: unknown): Promise<Evaluated> => corePrepare(OWNER, name, raw);

/** Call a source, then prepare its output. */
export const evaluate = (name: string, load: () => unknown): Promise<Evaluated> => coreEvaluate(OWNER, name, load);

export const dataPath = (name: string, revision: string): string => `/_relate/${name}/graph.${revision}.json`;
export const descriptorPath = (name: string): string => `/_relate/${name}/descriptor.json`;

/** The ADR-003 descriptor of an evaluated graph. */
export const descriptorOf = (name: string, evaluated: Evaluated, indexes: IndexSpec[], base: string) =>
  coreDescriptorOf(name, evaluated, indexes, base, dataPath(name, evaluated.revision));
