// The registered graphs of the conformance site.
import type { Graphs } from "@relate/nextjs/server";
import { sized, small } from "./documents";

export const graphs = {
  example: { source: () => sized(300), lifetime: "visit", indexes: [{ label: "Page", property: "id" }] },
  small: { source: small },
  // the load-figure pages
  fig20: { source: () => sized(20) },
  fig300: { source: () => sized(300) },
  fig2000: { source: () => sized(2000) },
} satisfies Graphs;
