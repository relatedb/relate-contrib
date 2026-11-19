import { catalog } from "@relate/contrib-sveltekit/server";
import { graphs } from "#lib/graphs.ts";

export const load = () => ({ catalog: catalog(graphs) });
