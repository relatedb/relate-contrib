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
/** The mounted provider's configuration, for code that lives across pages. Written only after mount, never during a render. */
var mountedConfig = () => mounted;
/**
* @param {Config} config
* @returns {() => void} the cleanup
*/
function mount(config) {
	mounted = config;
	return () => {
		if (mounted === config) mounted = null;
	};
}
export { setConfig as i, mount as n, mountedConfig as r, getConfig as t };

//# sourceMappingURL=context.js.map