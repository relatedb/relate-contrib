import { createGraphRoute } from "@relate/contrib-sveltekit/server";
import { graphs } from "#lib/graphs.ts";
export const prerender = true;
export const { GET, entries } = createGraphRoute(graphs);
