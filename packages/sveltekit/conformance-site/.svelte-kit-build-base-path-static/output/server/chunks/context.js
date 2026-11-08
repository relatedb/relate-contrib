import { a as getContext, o as setContext } from "./server2.js";
import "./index-server.js";
// ../src/context.js
var KEY = Symbol.for("@relate/sveltekit/config");
/**
* @typedef {{ id: string, lifetime: "page" | "visit", indexes: Array<{ label: string, property: string }> }} CatalogEntry
* @typedef {{ catalog: CatalogEntry[], engineUrl: string | URL, profile: "client-routing" | "multi-page", renderIds: Set<string> }} Config
*/
/** @param {Config} config */
var setConfig = (config) => setContext(KEY, config);
/** @returns {Config | undefined} */
var getConfig = () => getContext(KEY);
/** @type {Config | null} */
var mounted = null;
/** The mounted provider's configuration, for code that lives across pages. Written only in the browser, by an effect, never on the server. */
var mountedConfig = () => mounted;
export { mountedConfig as n, setConfig as r, getConfig as t };

//# sourceMappingURL=context.js.map