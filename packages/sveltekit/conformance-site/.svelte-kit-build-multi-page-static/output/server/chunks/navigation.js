import { n as noop, t as disallow_on_server } from "./functions.js";
// ../../../node_modules/.pnpm/@sveltejs+kit@3.1.1_@sveltejs+vite-plugin-svelte@7.3.1_svelte@5.57.3_vite@8.3.6_@types+_04d84c7668bae5baea979d5d81a6a845/node_modules/@sveltejs/kit/src/runtime/app/navigation/server.js
var afterNavigate = noop;
disallow_on_server("disableScrollHandling", "()");
var goto = disallow_on_server("goto");
disallow_on_server("invalidate");
disallow_on_server("invalidateAll", "()");
disallow_on_server("refreshAll", "()");
disallow_on_server("preloadCode");
disallow_on_server("preloadData");
disallow_on_server("pushState");
disallow_on_server("replaceState");
export { goto as n, afterNavigate as t };

//# sourceMappingURL=navigation.js.map