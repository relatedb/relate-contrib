export type PropertyValue = string | number | boolean | string[] | number[] | boolean[];
export type Properties = Record<string, PropertyValue>;
export interface GraphNode {
    id: string;
    labels?: string[];
    properties?: Properties;
}
export interface GraphLink {
    source: string;
    target: string;
    type: string;
    properties?: Properties;
}
export interface GraphDocument {
    version: 1;
    revision?: string;
    nodes: GraphNode[];
    links: GraphLink[];
}
export interface IndexSpec {
    label: string;
    property: string;
}
export interface Descriptor {
    version: 1;
    id: string;
    revision: string;
    data: {
        url: string;
        nodes: number;
        links: number;
    };
    indexes?: IndexSpec[];
}
/** The engine's result envelope, exactly as it arrives. Nothing is added or reshaped. */
export interface Envelope {
    columns: string[];
    rows: Array<Record<string, unknown>>;
    error: string | null;
    [key: string]: unknown;
}
