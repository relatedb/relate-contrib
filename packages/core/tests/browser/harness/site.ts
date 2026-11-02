// A small site with a client-side router, used by the profile tests. Query parameters configure it:
//   pages=N          size of the generated graph (default 300)
//   graph=descriptor load through a descriptor served at /data/site-<pages>.json (the test routes it)
//   navigation=...   client-routing (default) or multi-page
import engineUrl from "@neo4j-labs/cypherlite-wasm/cypherlite_bg.wasm?url";
import * as core from "../../../dist/index.js";
import { generateGraph } from "../../fixtures/generate-graph.js";
import * as faults from "./faults.js";
import { startRouter } from "./router.js";

const params = new URLSearchParams(location.search);
const pages = Number(params.get("pages") ?? 300);
const graph = generateGraph(pages, { id: "site", dataUrl: `/data/site-${pages}.json` });
const tracked = faults.trackedWorkers();
const w = window as any;

w.core = core;
w.tracked = tracked;
w.faults = faults;
w.engineUrl = engineUrl;
w.graph = graph;
w.log = [] as unknown[];

const client = core.createSiteClient({
  engineUrl,
  graph: params.get("graph") === "descriptor" ? { descriptor: graph.descriptor } : { document: graph.document },
  navigation: (params.get("navigation") as "client-routing" | "multi-page" | null) ?? "client-routing",
  workerFactory: tracked.factory,
});
w.client = client;
w.clientToken = Math.random().toString(36).slice(2);

const overlay = (page: number) => ({
  version: 1 as const,
  nodes: [
    { id: `note-${page}-a`, labels: ["Note"], properties: { page } },
    { id: `note-${page}-b`, labels: ["Note"], properties: { page } },
  ],
  links: [{ source: `note-${page}-a`, target: `note-${page}-b`, type: "ABOUT" }],
});

let view: ReturnType<typeof core.attachView> | null = null;
let unsubscribe: (() => void) | null = null;
let arrivals = 0;

const router = startRouter({
  onArrive(url) {
    const page = Number(url.searchParams.get("page") ?? 1);
    arrivals++;
    document.getElementById("title")!.textContent = `Page ${page}`;
    const next = new URL(url);
    next.searchParams.set("page", String(page + 1));
    document.getElementById("nav")!.innerHTML = `<a id="next" data-route href="${next.pathname}${next.search}">Next</a>`;
    view = core.attachView(client, overlay(page));
    unsubscribe = client.subscribe("MATCH (n:Note) RETURN count(n) AS c, collect(DISTINCT n.page) AS pages", null, (u) => {
      w.log.push({ page, ...u });
      if (u.rows) document.getElementById("notes")!.textContent = `${u.rows[0]?.c} notes`;
    });
  },
  onDepart() {
    unsubscribe?.();
    void view?.detach();
    view = null;
  },
});
w.navigate = (href: string) => router.navigate(href);
w.arrivals = () => arrivals;
document.documentElement.dataset.site = "ready";
