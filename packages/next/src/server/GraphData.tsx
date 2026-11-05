// A small graph written into the page (spec FR-013 to FR-015, ADR-005 §2.3): no descriptor, no revision, no stored copy,
// no extra request. A component asks for it by name through `useGraph`.
import { cache } from "react";
import { checkInline, escapeJson } from "related-web-core/build";
import type { InlineConfig } from "related-web-core/build";
import { OWNER, registeredNames } from "./graphs.js";

export interface GraphDataProps {
  id: string;
  document: unknown;
  config?: InlineConfig;
  /** Names the page in an error message. Next also names the page it was prerendering when a render fails. */
  page?: string;
}

/** The names used so far in one render: React's per-request cache, so concurrent renders do not share it. */
const seenInRender = cache(() => new Set<string>());

/** The script element's text, or an error that names the page, the graph and the first problem. */
export function inlineText(props: GraphDataProps, seen: Set<string>, registered: string[] = [...registeredNames]): string {
  const graph = checkInline(OWNER, props.page ?? "this page", props.id, props.document, props.config, seen, registered);
  return escapeJson(graph);
}

export function GraphData(props: GraphDataProps) {
  const html = inlineText(props, seenInRender());
  return <script type="application/json" data-related-graph={props.id} dangerouslySetInnerHTML={{ __html: html }} />;
}
