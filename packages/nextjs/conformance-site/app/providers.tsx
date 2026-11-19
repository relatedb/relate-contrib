"use client";
import { RelateProvider } from "@relate/contrib-nextjs/client";
import type { Catalog } from "@relate/contrib-nextjs/server";
import type { ReactNode } from "react";

// The engine's binary is placed by the bundler; the site passes its URL.
const engineUrl = new URL("@relate/relate-wasm/relate_bg.wasm", import.meta.url);

export function Providers({ catalog, children }: { catalog: Catalog; children: ReactNode }) {
  return <RelateProvider catalog={catalog} engineUrl={engineUrl}>{children}</RelateProvider>;
}
