// The page lifecycle (spec FR-016, FR-019; ADR-004 2.3). Astro runs a bundled script once per document and fires
// `astro:page-load` on the first load only when the router is present, so the first run does not wait for that event
// and a registration is run at most once for each page it is eligible for.
import { PageClients, type GraphOptions } from "./registry.js";
import { checkProfile } from "./profile.js";
import type { Client } from "@relate/contrib-web";

export interface Page {
  /** The core's client for a graph this page uses: an inline graph of the page first, then a registered one. */
  graph(name: string, options?: GraphOptions): Client;
}

export interface PageOptions {
  /** Run only on pages where `document.querySelector(selector)` matches. Default: every page. */
  selector?: string;
}

interface Registration {
  setup: (page: Page) => void | (() => void);
  selector?: string;
  /** The page counter at which this registration last ran. */
  ranAt: number;
  cleanup: (() => void) | undefined;
}

const registrations: Registration[] = [];
let clients: PageClients | null = null;
let active = false;
/** Increases at each departure, so a registration runs once per page. */
let pageNumber = 0;
let wired = false;

const ready = (): boolean => document.readyState !== "loading";

function arrive(): void {
  if (!ready()) return;
  active = true;
  checkProfile();
  clients ??= new PageClients();
  const page: Page = { graph: (name, options) => clients!.graph(name, options) };
  for (const reg of registrations) {
    if (reg.ranAt === pageNumber) continue;
    if (reg.selector && !document.querySelector(reg.selector)) continue;
    reg.ranAt = pageNumber;
    reg.cleanup = reg.setup(page) ?? undefined;
  }
}

function depart(): void {
  if (!active) return;
  active = false;
  for (const reg of registrations) {
    reg.cleanup?.();
    reg.cleanup = undefined;
  }
  clients?.dispose();
  clients = null;
  pageNumber++;
}

function wire(): void {
  if (wired) return;
  wired = true;
  document.addEventListener("astro:before-swap", depart);
  document.addEventListener("astro:page-load", arrive);
  window.addEventListener("pagehide", depart);
  // A page restored from the back-forward cache did not load again.
  window.addEventListener("pageshow", (e) => {
    if (e.persisted) arrive();
  });
  if (!ready()) document.addEventListener("DOMContentLoaded", arrive, { once: true });
}

/** Run `setup` for the page, now and on every later page the router brings in. */
export function onPage(setup: Registration["setup"], options: PageOptions = {}): void {
  wire();
  registrations.push({ setup, selector: options.selector, ranAt: -1, cleanup: undefined });
  // Run now when the document is ready. A page being swapped in runs here too (its scripts run after the swap), and its
  // page-load event then finds the registration already run.
  if (ready()) arrive();
}
