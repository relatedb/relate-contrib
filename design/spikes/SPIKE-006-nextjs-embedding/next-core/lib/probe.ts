"use client";
// Client held in module state, with an identity readable from the page (SPIKE-006 step 4).
import { createClient } from "related-web-core";
import type { Client } from "related-web-core";
import descriptor from "../public/descriptor.json";

const engineUrl = new URL("@neo4j-labs/cypherlite-wasm/cypherlite_bg.wasm", import.meta.url);

let client: Client | null = null;
let spawns = 0;
export const moduleId = Math.random().toString(36).slice(2, 8);

export function getClient(): Client {
  if (!client) {
    spawns++;
    client = createClient({
      engineUrl,
      graph: { descriptor: { ...descriptor, data: { ...descriptor.data, url: `${process.env.NEXT_PUBLIC_BASE ?? ""}${descriptor.data.url}` } } as never },
      navigation: "client-routing",
      workerFactory: undefined,
    });
  }
  return client;
}
export const spawnCount = (): number => spawns;
