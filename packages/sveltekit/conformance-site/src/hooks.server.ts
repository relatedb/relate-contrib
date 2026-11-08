import type { Handle } from "@sveltejs/kit";

// NAVIGATION=multi-page makes every navigation load a document: `data-sveltekit-reload` on the body (ADR-007 §2.5). The hook also
// runs while prerendering, so the attribute is in the prerendered files.
export const handle: Handle = ({ event, resolve }) => {
  // The core's scenarios open `/index.html`. A static output has that file; a Node server maps only `/`, so it redirects.
  if (event.url.pathname === "/index.html") return new Response(null, { status: 308, headers: { location: "/" } });
  return resolve(event, { transformPageChunk: ({ html }) => (process.env.NAVIGATION === "multi-page" ? html.replace("<body", "<body data-sveltekit-reload") : html) });
};
