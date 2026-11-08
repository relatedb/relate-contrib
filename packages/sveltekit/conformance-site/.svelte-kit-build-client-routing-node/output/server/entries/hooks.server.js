// src/hooks.server.ts
var handle = ({ event, resolve }) => {
	if (event.url.pathname === "/index.html") return new Response(null, {
		status: 308,
		headers: { location: "/" }
	});
	return resolve(event, { transformPageChunk: ({ html }) => process.env.NAVIGATION === "multi-page" ? html.replace("<body", "<body data-sveltekit-reload") : html });
};
export { handle };

//# sourceMappingURL=hooks.server.js.map