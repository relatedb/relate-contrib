// The names of the environment values the configuration wrapper sets. Next replaces `process.env.NAME` in bundled code
// at build time, so every reader writes the full expression `process.env.RELATE_NEXTJS_…`; these names are for the wrapper.
export const ENV_BASE_PATH = "RELATE_NEXTJS_BASE_PATH";
export const ENV_DIST_DIR = "RELATE_NEXTJS_DIST_DIR";
export const ENV_NAVIGATION = "RELATE_NEXTJS_NAVIGATION";

export type Navigation = "client-routing" | "multi-page";
export const NAVIGATIONS: readonly Navigation[] = ["client-routing", "multi-page"];
