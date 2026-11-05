// The names of the environment values the configuration wrapper sets. Next replaces `process.env.NAME` in bundled code
// at build time, so every reader writes the full expression `process.env.RELATE_WEB_…`; these names are for the wrapper.
export const ENV_BASE_PATH = "RELATE_WEB_BASE_PATH";
export const ENV_NAVIGATION = "RELATE_WEB_NAVIGATION";

export type Navigation = "client-routing" | "multi-page";
export const NAVIGATIONS: readonly Navigation[] = ["client-routing", "multi-page"];
