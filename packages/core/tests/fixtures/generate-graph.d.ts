import type { Descriptor, GraphDocument } from "../../src/data/types.js";
export interface GeneratedGraph {
    descriptor: Descriptor;
    document: GraphDocument;
}
export declare function generateGraph(pages: number, options?: {
    linksPerPage?: number;
    id?: string;
    revision?: string;
    dataUrl?: string;
    indexes?: boolean;
}): GeneratedGraph;
