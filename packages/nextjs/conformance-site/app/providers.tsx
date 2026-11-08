"use client";
import { RelateProvider } from "@relate/nextjs/client";
import type { Catalog } from "@relate/nextjs/server";
import type { ReactNode } from "react";

// The engine's binary is placed by the bundler; the site passes its URL.
const engineUrl = new URL("@neo4j-labs/cypherlite-wasm/cypherlite_bg.wasm", import.meta.url);

export function Providers({ catalog, children }: { catalog: Catalog; children: ReactNode }) {
  return <RelateProvider catalog={catalog} engineUrl={engineUrl}>{children}</RelateProvider>;
}
