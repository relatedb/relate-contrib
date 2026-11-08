// Checking and serializing an inline graph (spec FR-013 to FR-015). Used by GraphData.astro at render time.
// The rules live in `@relate/web/build`; this file binds them to the adapter's name.
import { checkInline as coreCheckInline } from "@relate/web/build";
import type { InlineConfig, InlineGraph } from "@relate/web/build";

export { escapeJson } from "@relate/web/build";
export type { InlineConfig, InlineGraph } from "@relate/web/build";

export const checkInline = (page: string, id: string, document: unknown, config: InlineConfig | undefined, seen: Set<string>, registered: string[]): InlineGraph =>
  coreCheckInline("@relate/astro", page, id, document, config, seen, registered);
