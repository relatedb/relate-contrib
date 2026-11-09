// Resolving an application's seed in the worker, only when a store needs one (ADR-009 2.2). A seed is inline data, a
// descriptor whose data is fetched, or a URL of either; fetching waits until the lifecycle says a seed is needed.
import { validateDescriptor } from "../../data/descriptor.js";
import type { Descriptor } from "../../data/types.js";
import type { ApplicationInit } from "../protocol.js";

/** The seed could not be read; `reason` is the init failure to report. */
export class SeedError extends Error {
  constructor(readonly reason: "worker-error" | "invalid-descriptor", message: string) {
    super(message);
    this.name = "SeedError";
  }
}

async function fetchJson(url: string, what: string): Promise<unknown> {
  const response = await fetch(url);
  if (!response.ok) throw new SeedError("worker-error", `the ${what} could not be fetched: ${response.status} ${response.statusText}`);
  return response.json();
}

const isDocument = (v: unknown): boolean => Boolean(v) && typeof v === "object" && "nodes" in (v as object);

function checkedDescriptor(value: unknown): Descriptor {
  const checked = validateDescriptor(value);
  if (!checked.ok) throw new SeedError("invalid-descriptor", `${checked.path}: ${checked.message}`);
  return checked.descriptor;
}

/** The descriptor of a seed given as a URL, without fetching its data; null when the URL holds a plain document. */
export async function seedDescriptor(seed: ApplicationInit["seed"]): Promise<Descriptor | null> {
  if (seed.descriptor) return seed.descriptor;
  if (!seed.url) return null;
  const value = await fetchJson(seed.url, "seed");
  return isDocument(value) ? null : checkedDescriptor(value);
}

/** The seed's data document and, when it has one, its descriptor. */
export async function loadSeed(seed: ApplicationInit["seed"]): Promise<{ document: unknown; descriptor: Descriptor | null }> {
  if (seed.document) return { document: seed.document, descriptor: null };
  if (seed.descriptor && seed.dataUrl) return { document: await fetchJson(seed.dataUrl, "seed data"), descriptor: seed.descriptor };
  if (!seed.url) throw new SeedError("worker-error", "no seed location was given");
  const value = await fetchJson(seed.url, "seed");
  if (isDocument(value)) return { document: value, descriptor: null };
  const descriptor = checkedDescriptor(value);
  const dataUrl = new URL(descriptor.data.url, seed.url).href;
  return { document: await fetchJson(dataUrl, "seed data"), descriptor };
}
