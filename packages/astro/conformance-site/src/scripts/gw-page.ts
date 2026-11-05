// The behavior shared by the conformance pages, written against `@relate/web-astro/client`. Every observable thing is a
// `data-gw-*` element, the contract the core's conformance scenarios drive (packages/core/conformance/example-site/gw-page.ts).
//
// Query parameters: navigation=client-routing|multi-page (the profile), variant=a|b|mismatch|broken (which descriptor).
import { onPage } from "@relate/web-astro/client";
import { navigate } from "astro:transitions/client";
import { attachView } from "@relate/web-core";
import type { Client, View } from "@relate/web-core";

(window as unknown as { __gwNavigate: typeof navigate }).__gwNavigate = navigate; // for the adapter's own tests
const params = new URLSearchParams(location.search);
const navigation = (params.get("navigation") ?? undefined) as "client-routing" | "multi-page" | undefined;
const variant = params.get("variant") ?? document.body.dataset.gwVariant ?? "a";
// Variant a is the registered graph. The other variants are static descriptors the integration cannot generate
// (the same id with another revision, counts that disagree, data that is missing); they go through the testing aid.
const descriptors: Record<string, string | undefined> = { a: undefined, b: "/descriptor-b.json", mismatch: "/descriptor-mismatch.json", broken: "/descriptor-broken.json" };
const instance = Math.random().toString(36).slice(2, 8);

const trap = `RETURN ${"(".repeat(1000)}1${")".repeat(1000)} AS x`;
const runaway = "MATCH (a:Page), (b:Page), (c:Page) RETURN count(*) AS c";
const notes = {
  version: 1 as const,
  nodes: [
    { id: "note-a", labels: ["Note"] },
    { id: "note-b", labels: ["Note"] },
  ],
  links: [{ source: "note-a", target: "note-b", type: "ABOUT" }],
};

const restoredOf = new WeakMap<Client, string>();
const watched = new WeakSet<Client>();
let current: Client | null = null;
let lastError = "";

const set = (name: string, value: string): void => {
  const el = document.querySelector(`[data-gw-${name}]`);
  if (el) el.textContent = value;
};

document.addEventListener("click", (e) => {
  const action = (e.target as Element | null)?.closest("[data-gw-action]")?.getAttribute("data-gw-action");
  const client = current;
  if (!client) return;
  const record = (err: { reason: string }): void => {
    lastError = err.reason;
    set("last-error", lastError);
  };
  if (action === "trap") void client.query(trap).catch(record);
  else if (action === "timeout") void client.query(runaway, null, { timeoutMs: 400 }).catch(record);
});

onPage((page) => {
  const body = document.body.dataset;
  const name = body.gwGraph ?? "example";
  const label = body.gwLabel ?? "Page";
  const client = page.graph(name, { navigation, descriptor: name === "example" ? descriptors[variant] : undefined });
  current = client;
  (window as unknown as { __gw?: { client: Client } }).__gw = { client }; // for the adapter's own tests
  if (!watched.has(client)) {
    watched.add(client);
    client.on("timing", ({ phase, restored }) => {
      if (phase === "total") {
        restoredOf.set(client, String(restored));
        if (current === client) set("restored", String(restored));
      }
    });
  }
  const profile = (navigation ?? (document.querySelector('meta[name="astro-view-transitions-enabled"]') ? "client-routing" : "multi-page")) === "client-routing" ? "persistent" : "per-page";
  const state = { status: client.status, generation: client.generation, count: "…", updates: 0, notes: "…", failure: "" };
  const render = (): void => {
    set("status", state.status);
    set("generation", String(state.generation));
    set("profile", profile);
    set("instance", instance);
    set("restored", restoredOf.get(client) ?? "unknown");
    set("count", state.count);
    set("updates", String(state.updates));
    set("last-error", lastError);
    set("failure", state.failure);
    set("notes", state.notes);
    document.documentElement.dataset.gwState = state.status;
  };

  const notesPage = "gwNotesPage" in document.body.dataset;
  document.querySelector("[data-gw-notes-row]")?.toggleAttribute("hidden", !notesPage);

  const offs: Array<() => void> = [];
  offs.push(
    client.on("status", ({ status, generation }) => {
      state.status = status;
      state.generation = generation;
      state.failure = status === "failed" ? client.failureMessage() : "";
      render();
    }),
  );
  offs.push(
    client.subscribe(`MATCH (n:${label}) RETURN count(n) AS c`, null, (u) => {
      state.status = u.status;
      state.generation = u.generation;
      if (u.rows) {
        state.count = String(u.rows[0]?.c);
        state.updates++;
      }
      render();
    }),
  );
  let view: View | null = null;
  if (notesPage) {
    // Subscribe once the view's data is in: a subscription made while the data is still being added would
    // show the count before the add, and nothing re-runs it until the next replacement.
    const mine = (view = attachView(client, notes));
    void mine.ready.then(() => {
      if (view !== mine) return; // the page was left before the data arrived
      offs.push(
        client.subscribe("MATCH (n:Note) RETURN count(n) AS c", null, (u) => {
          if (u.rows) state.notes = String(u.rows[0]?.c);
          render();
        }),
      );
    });
  }
  render();
  return () => {
    for (const off of offs) off();
    void view?.detach();
    view = null;
  };
}, { selector: "[data-gw-status]" }); // the blank page has no graph
