// The client module (spec FR-016 to FR-026; contracts/client-module.md).
export { onPage } from "./page.js";
export type { Page, PageOptions } from "./page.js";
export type { GraphOptions } from "./registry.js";
import { visitGraph } from "./registry.js";
import type { GraphOptions } from "./registry.js";
import type { Client } from "@relate/contrib-web";

/** The client for a visit-lifetime registered graph, for code that lives across pages. */
export function graph(name: string, options?: GraphOptions): Client {
  return visitGraph(name, options);
}
