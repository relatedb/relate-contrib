// The registered graphs of the conformance site.
import type { Graphs } from "@relate/sveltekit/server";
import { sized, small } from "./documents";

export const graphs = {
  example: { source: () => sized(300), lifetime: "visit", indexes: [{ label: "Page", property: "id" }] },
  small: { source: small },
  other: { source: () => sized(10) },
} satisfies Graphs;
