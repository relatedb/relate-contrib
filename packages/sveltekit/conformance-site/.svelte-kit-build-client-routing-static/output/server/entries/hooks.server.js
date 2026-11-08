// src/hooks.server.ts
var handle = ({ event, resolve }) => resolve(event, { transformPageChunk: ({ html }) => process.env.NAVIGATION === "multi-page" ? html.replace("<body", "<body data-sveltekit-reload") : html });
export { handle };

//# sourceMappingURL=hooks.server.js.map