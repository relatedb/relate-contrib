import type { Client, Status } from "@relate/contrib-web";
import type { InlineConfig } from "@relate/contrib-web/build";
import type { Component, Snippet } from "svelte";

export type Navigation = "client-routing" | "multi-page";

export interface CatalogEntry {
  id: string;
  lifetime: "page" | "visit";
  indexes: Array<{ label: string; property: string }>;
}

/** Options that override what the provider and the catalog say. Testing aids: each changes only that value passed to the core. */
export interface GraphOptions {
  /** The profile passed to the core instead of the provider's. */
  navigation?: Navigation;
  /** The descriptor location used instead of the registered graph's. */
  descriptor?: string;
}

/** A value or a function that returns it, so a helper can follow a reactive value. */
export type Reactive<T> = T | (() => T);

export const RelateProvider: Component<{
  catalog: CatalogEntry[];
  /** The URL of the engine binary, passed to the core unchanged. */
  engineUrl: string | URL;
  /** `"client-routing"` (default) or `"multi-page"`. */
  navigation?: Navigation;
  children?: Snippet;
}>;

export const GraphData: Component<{
  id: string;
  document: unknown;
  config?: InlineConfig;
  /** The page's path, for error messages. */
  page: string;
}>;

/** The core's client, or `null` on the server and until the component has mounted. */
export function useGraph(id: Reactive<string>, options?: GraphOptions): { readonly client: Client | null };

/** `status` is `"idle"` until the client answers, then the core's status. */
export function useQuery(
  id: Reactive<string>,
  statement: Reactive<string>,
  params?: Reactive<object | null | undefined>,
  options?: GraphOptions,
): {
  readonly status: Status | "idle";
  readonly rows: Array<Record<string, unknown>> | null;
  readonly error: string | null;
  readonly generation: number;
};

/** The client of a visit-lifetime registered graph, for code that lives across pages. Throws for a page-lifetime or inline graph and for an unknown id. */
export function graph(id: string, options?: GraphOptions): Client;
