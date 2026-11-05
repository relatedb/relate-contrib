// Checking and serializing an inline graph (spec FR-013 to FR-015). Used by GraphData.astro at render time.
// The rules live in `related-web-core/build`; this file binds them to the adapter's name.
import { checkInline as coreCheckInline } from "related-web-core/build";
import type { InlineConfig, InlineGraph } from "related-web-core/build";

export { escapeJson } from "related-web-core/build";
export type { InlineConfig, InlineGraph } from "related-web-core/build";

export const checkInline = (page: string, id: string, document: unknown, config: InlineConfig | undefined, seen: Set<string>, registered: string[]): InlineGraph =>
  coreCheckInline("related-web-astro", page, id, document, config, seen, registered);
