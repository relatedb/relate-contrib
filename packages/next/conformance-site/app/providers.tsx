"use client";
import { RelateWebProvider } from "@relate/web-next/client";
import type { Catalog } from "@relate/web-next/server";
import type { ReactNode } from "react";

// The engine's binary is placed by the bundler; the site passes its URL.
const engineUrl = new URL("@neo4j-labs/cypherlite-wasm/cypherlite_bg.wasm", import.meta.url);

export function Providers({ catalog, children }: { catalog: Catalog; children: ReactNode }) {
  return <RelateWebProvider catalog={catalog} engineUrl={engineUrl}>{children}</RelateWebProvider>;
}
