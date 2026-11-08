"use client";
// `@relate/nextjs/client` (spec FR-016 to FR-024).
import type { Client } from "@relate/web";
import { mountedConfig } from "./Provider.js";
import { visitGraph } from "./registry.js";
import type { GraphOptions } from "./registry.js";

export { RelateProvider } from "./Provider.js";
export type { RelateProviderProps } from "./Provider.js";
export { useGraph, useQuery } from "./hooks.js";
export type { QueryResult } from "./hooks.js";
export type { GraphOptions, Navigation } from "./registry.js";

/** A visit-lifetime registered graph, for code that lives across pages. Fails for a page graph or an inline graph. */
export const graph = (id: string, options?: GraphOptions): Client => visitGraph(mountedConfig(), id, options);
