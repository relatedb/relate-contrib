import { createGraphRoute } from "@relate/sveltekit/server";
import { graphs } from "#lib/graphs.ts";
export const prerender = true;
export const { GET, entries } = createGraphRoute(graphs);
