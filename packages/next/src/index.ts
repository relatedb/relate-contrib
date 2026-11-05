// The configuration wrapper (spec FR-002, ADR-005 §2.1): makes the base path and the navigation profile available to
// client code and changes nothing else.
import { ENV_BASE_PATH, ENV_NAVIGATION, NAVIGATIONS } from "./env.js";
import type { Navigation } from "./env.js";

export type { Navigation } from "./env.js";

export interface RelateWebOptions {
  /** `"client-routing"` (default): the site navigates inside one document. `"multi-page"`: every page is a document. */
  navigation?: Navigation;
}

interface NextConfigLike {
  basePath?: string;
  env?: Record<string, string | undefined>;
  [key: string]: unknown;
}

export function withRelateWeb<T extends NextConfigLike>(nextConfig: T = {} as T, options: RelateWebOptions = {}): T {
  const navigation = options.navigation ?? "client-routing";
  if (!NAVIGATIONS.includes(navigation)) {
    throw new Error(`@relate/web-next: navigation "${String(navigation)}" is not one of ${NAVIGATIONS.map((n) => `"${n}"`).join(", ")}`);
  }
  const basePath = nextConfig.basePath ?? "";
  // The server entry reads these from the process: route handlers and server components may not be bundled with the config's `env`.
  process.env[ENV_BASE_PATH] = basePath;
  process.env[ENV_NAVIGATION] = navigation;
  return { ...nextConfig, env: { ...nextConfig.env, [ENV_BASE_PATH]: basePath, [ENV_NAVIGATION]: navigation } };
}
