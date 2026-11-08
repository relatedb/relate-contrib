import * as universal from '../entries/pages/_layout.ts.js';
import * as server from '../entries/pages/_layout.server.ts.js';

export const index = 0;
let component_cache;
export const component = async () => component_cache ??= (await import('../entries/pages/_layout.svelte.js')).default;
export { universal };
export const universal_id = "src/routes/+layout.ts";
export { server };
export const server_id = "src/routes/+layout.server.ts";
export const imports = ["_app/immutable/nodes/0.IfE2hpyL.js","_app/immutable/chunks/B17XUGQh.js","_app/immutable/entry/payload.DSmR2FwN.js","_app/immutable/chunks/XpuP7gx0.js","_app/immutable/chunks/CIwQ7RWn.js","_app/immutable/chunks/DVqHga60.js"];
export const stylesheets = [];
export const fonts = [];
