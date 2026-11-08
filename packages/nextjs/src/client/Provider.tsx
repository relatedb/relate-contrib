"use client";
// The provider (spec FR-016): puts the catalog, the engine location and the profile in context. Creates no client and starts no worker.
import { createContext, useEffect, useMemo } from "react";
import type { ReactNode } from "react";
import type { Navigation } from "../env.js";
import type { Catalog } from "../server/catalog.js";
import type { Config } from "./registry.js";

export const ConfigContext = createContext<Config | null>(null);

/** The mounted provider's configuration, for the direct lookup. Written in an effect, never during render. */
let mounted: Config | null = null;
export const mountedConfig = (): Config | null => mounted;

export interface RelateProviderProps {
  catalog: Catalog;
  /** The URL of the engine binary, passed to the core unchanged. */
  engineUrl: string | URL;
  /** Testing aid: the profile instead of the one the configuration wrapper set. */
  navigation?: Navigation;
  children: ReactNode;
}

export function RelateProvider({ catalog, engineUrl, navigation, children }: RelateProviderProps) {
  const profile = navigation ?? ((process.env.RELATE_NEXTJS_NAVIGATION as Navigation | undefined) ?? "client-routing");
  const config = useMemo<Config>(() => ({ catalog, engineUrl, profile }), [catalog, engineUrl, profile]);
  useEffect(() => {
    mounted = config;
    return () => {
      if (mounted === config) mounted = null;
    };
  }, [config]);
  return <ConfigContext value={config}>{children}</ConfigContext>;
}
