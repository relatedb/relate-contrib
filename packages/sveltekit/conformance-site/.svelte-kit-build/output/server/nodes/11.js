import * as server from '../entries/pages/live.html/_page.server.ts.js';

export const index = 11;
let component_cache;
export const component = async () => component_cache ??= (await import('../entries/pages/live.html/_page.svelte.js')).default;
export { server };
export const server_id = "src/routes/live.html/+page.server.ts";
export const imports = ["_app/immutable/nodes/11.CPx7lvNb.js","_app/immutable/chunks/BILRai64.js","_app/immutable/entry/payload.DSmR2FwN.js","_app/immutable/chunks/3KUzPVqs.js","_app/immutable/chunks/DHhcGRfV.js"];
export const stylesheets = [];
export const fonts = [];
