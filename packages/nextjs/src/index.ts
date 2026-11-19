// The configuration wrapper (spec FR-002, ADR-005 §2.1): makes the base path and the navigation profile available to
// client code and changes nothing else.
import { ENV_BASE_PATH, ENV_NAVIGATION, NAVIGATIONS } from "./env.js";
import type { Navigation } from "./env.js";

export type { Navigation } from "./env.js";

export interface RelateOptions {
  /** `"client-routing"` (default): the site navigates inside one document. `"multi-page"`: every page is a document. */
  navigation?: Navigation;
}

interface NextConfigLike {
  basePath?: string;
  env?: Record<string, string | undefined>;
  [key: string]: unknown;
}

/** A configuration as Next accepts it: an object, or a function (phase, context) of one, or an async function. */
type ConfigInput<T extends NextConfigLike> = T | ((...args: never[]) => T | Promise<T>);

function wrap<T extends NextConfigLike>(nextConfig: T, navigation: Navigation): T {
  const basePath = nextConfig.basePath ?? "";
  // The server entry reads these from the process: route handlers and server components may not be bundled with the config's `env`.
  process.env[ENV_BASE_PATH] = basePath;
  process.env[ENV_NAVIGATION] = navigation;
  return { ...nextConfig, env: { ...nextConfig.env, [ENV_BASE_PATH]: basePath, [ENV_NAVIGATION]: navigation } };
}

export function withRelate<T extends NextConfigLike>(nextConfig: T, options?: RelateOptions): T;
export function withRelate<T extends NextConfigLike, A extends never[]>(nextConfig: (...args: A) => T | Promise<T>, options?: RelateOptions): (...args: A) => Promise<T>;
export function withRelate<T extends NextConfigLike>(nextConfig: ConfigInput<T> = {} as T, options: RelateOptions = {}): unknown {
  const navigation = options.navigation ?? "client-routing";
  if (!NAVIGATIONS.includes(navigation)) {
    throw new Error(`@relate/contrib-nextjs: navigation "${String(navigation)}" is not one of ${NAVIGATIONS.map((n) => `"${n}"`).join(", ")}`);
  }
  if (typeof nextConfig === "function") {
    return async (...args: never[]) => wrap(await nextConfig(...args), navigation);
  }
  return wrap(nextConfig, navigation);
}
