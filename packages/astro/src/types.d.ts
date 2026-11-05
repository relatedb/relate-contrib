// Types for the integration's virtual modules, and the engine binary's `?url` import.
declare module "virtual:relate-web/config" {
  export const navigation: "multi-page" | "client-routing";
  export const graphs: Record<string, { descriptor: string; lifetime: "page" | "visit" }>;
}

declare module "virtual:relate-web/sources" {
  export const base: string;
  export const dev: boolean;
  const graphs: Array<{ name: string; indexes: Array<{ label: string; property: string }>; load: () => unknown }>;
  export default graphs;
}

declare module "@neo4j-labs/cypherlite-wasm/cypherlite_bg.wasm?url" {
  const url: string;
  export default url;
}
