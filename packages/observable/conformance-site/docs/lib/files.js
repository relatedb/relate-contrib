// The files a page opens. Framework finds a page's files by reading literal `FileAttachment(...)` calls, here and in the pages,
// so every file and every variant of the descriptor is named once, in full, in this module (research D-6).
import {FileAttachment} from "observablehq:stdlib";

export const engine = FileAttachment("../data/relate.wasm");
export const worker = FileAttachment("../data/relate-worker.js");

const missing = {url: async () => "/variants/missing.json", json: async () => null};

/** The descriptor and data of each variant of the example graph the core's scenarios choose with `?variant=`. */
export const variants = {
  a: {descriptor: FileAttachment("../data/example.descriptor.json"), data: FileAttachment("../data/example.graph.json")},
  b: {descriptor: FileAttachment("../variants/descriptor-b.json"), data: FileAttachment("../variants/graph-b.json")},
  mismatch: {descriptor: FileAttachment("../variants/descriptor-mismatch.json"), data: FileAttachment("../data/example.graph.json")},
  broken: {descriptor: FileAttachment("../variants/descriptor-broken.json"), data: missing},
};

/** The small graph, published by a loader, for the pages that open a graph from a data file. */
export const smallFile = FileAttachment("../data/small.graph.json");
