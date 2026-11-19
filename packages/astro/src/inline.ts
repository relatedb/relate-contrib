// Checking and serializing an inline graph (spec FR-013 to FR-015). Used by GraphData.astro at render time.
// The rules live in `@relate/contrib-web/build`; this file binds them to the adapter's name.
import { checkInline as coreCheckInline } from "@relate/contrib-web/build";
import type { InlineConfig, InlineGraph } from "@relate/contrib-web/build";

export { escapeJson } from "@relate/contrib-web/build";
export type { InlineConfig, InlineGraph } from "@relate/contrib-web/build";

export const checkInline = (page: string, id: string, document: unknown, config: InlineConfig | undefined, seen: Set<string>, registered: string[]): InlineGraph =>
  coreCheckInline("@relate/contrib-astro", page, id, document, config, seen, registered);
