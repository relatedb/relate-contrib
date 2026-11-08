import { catalog } from "@relate/sveltekit/server";
import { graphs } from "#lib/graphs.ts";

export const load = () => ({ catalog: catalog(graphs) });
