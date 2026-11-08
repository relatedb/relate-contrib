import * as server from '../entries/pages/live.html/_page.server.ts.js';

export const index = 11;
let component_cache;
export const component = async () => component_cache ??= (await import('../entries/pages/live.html/_page.svelte.js')).default;
export { server };
export const server_id = "src/routes/live.html/+page.server.ts";
export const imports = ["_app/immutable/nodes/11.B5BA7D1K.js","_app/immutable/chunks/DXH-uOA6.js","_app/immutable/entry/payload.DSmR2FwN.js","_app/immutable/chunks/B1LnumqA.js","_app/immutable/chunks/BIwgjURx.js"];
export const stylesheets = [];
export const fonts = [];
