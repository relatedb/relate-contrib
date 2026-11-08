// `@relate/web/build`: the build-time code every adapter shares (ADR-005 §2.2). Needs no DOM, no Node-only module and no framework.
export { canonicalText, revisionOf } from "./canonical.js";
export { prepare, evaluate } from "./prepare.js";
export type { Evaluated } from "./prepare.js";
export { descriptorOf, withBase } from "./descriptor.js";
export { checkInline, escapeJson } from "./inline.js";
export type { InlineConfig, InlineGraph } from "./inline.js";
