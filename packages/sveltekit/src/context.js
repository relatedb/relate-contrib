// What the provider puts in context, and the mounted provider's configuration for the direct lookup (ADR-007 §2.3, §2.4).
import { getContext, setContext } from "svelte";

const KEY = Symbol.for("@relate/sveltekit/config");

/**
 * @typedef {{ id: string, lifetime: "page" | "visit", indexes: Array<{ label: string, property: string }> }} CatalogEntry
 * @typedef {{ catalog: CatalogEntry[], engineUrl: string | URL, profile: "client-routing" | "multi-page", renderIds: Set<string> }} Config
 */

/** @param {Config} config */
export const setConfig = (config) => setContext(KEY, config);

/** @returns {Config | undefined} */
export const getConfig = () => getContext(KEY);

/** @type {Config | null} */
let mounted = null;

/** The mounted provider's configuration, for code that lives across pages. Written only in the browser, by an effect, never on the server. */
export const mountedConfig = () => mounted;

/**
 * @param {Config} config
 * @returns {() => void} the cleanup
 */
export function mount(config) {
  mounted = config;
  return () => {
    if (mounted === config) mounted = null;
  };
}
