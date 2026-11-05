// A small graph written into the page (spec FR-013 to FR-015, ADR-005 §2.3): no descriptor, no revision, no stored copy,
// no extra request. A component asks for it by name through `useGraph`.
import { cache } from "react";
import { checkInline, escapeJson } from "@relate/web-core/build";
import type { InlineConfig } from "@relate/web-core/build";
import { OWNER, registeredNames } from "./graphs.js";

export interface GraphDataProps {
  id: string;
  document: unknown;
  config?: InlineConfig;
  /** The page's path, for error messages: a failed render names the page and the graph. Server components cannot read their own route without making the page dynamic, so the author gives it. */
  page: string;
}

/** The names used so far in one render: React's per-request cache, so concurrent renders do not share it. */
const seenInRender = cache(() => new Set<string>());

/** The script element's text, or an error that names the page, the graph and the first problem. */
export function inlineText(props: GraphDataProps, seen: Set<string>, registered: string[] = [...registeredNames]): string {
  if (typeof props.page !== "string" || props.page === "") {
    throw new Error(`${OWNER}: inline graph "${String(props.id)}": GraphData needs a page prop, the page's path, to name the page in its error messages`);
  }
  const graph = checkInline(OWNER, props.page, props.id, props.document, props.config, seen, registered);
  return escapeJson(graph);
}

export function GraphData(props: GraphDataProps) {
  const html = inlineText(props, seenInRender());
  return <script type="application/json" data-relate-graph={props.id} dangerouslySetInnerHTML={{ __html: html }} />;
}
