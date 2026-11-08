import * as universal from '../entries/pages/_layout.ts.js';
import * as server from '../entries/pages/_layout.server.ts.js';

export const index = 0;
let component_cache;
export const component = async () => component_cache ??= (await import('../entries/pages/_layout.svelte.js')).default;
export { universal };
export const universal_id = "src/routes/+layout.ts";
export { server };
export const server_id = "src/routes/+layout.server.ts";
export const imports = ["_app/immutable/nodes/0.BXFNeMVx.js","_app/immutable/chunks/k45OOpT8.js","_app/immutable/entry/payload.DSmR2FwN.js","_app/immutable/chunks/Ce9JF21D.js","_app/immutable/chunks/CSaxVGkT.js","_app/immutable/chunks/Dj1kWg24.js"];
export const stylesheets = [];
export const fonts = [];
