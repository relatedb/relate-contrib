"use client";
// The behavior of the conformance pages, written against `@relate/web-next/client`. It renders nothing: it updates the
// `data-gw-*` elements of the static markup, as the core's example pages do. Query parameters: `navigation` (the profile)
// and `variant` (a, b, mismatch, broken: which descriptor the shared graph uses).
import { useGraph } from "@relate/web-next/client";
import { attachView } from "related-web-core";
import type { Client, View } from "related-web-core";
import { useEffect, useState } from "react";

const descriptors: Record<string, string | undefined> = { a: undefined, b: "/descriptor-b.json", mismatch: "/descriptor-mismatch.json", broken: "/descriptor-broken.json" };
const instance = Math.random().toString(36).slice(2, 8);
const trap = `RETURN ${"(".repeat(1000)}1${")".repeat(1000)} AS x`;
const runaway = "MATCH (a:Page), (b:Page), (c:Page) RETURN count(*) AS c";
const notes = {
  version: 1 as const,
  nodes: [{ id: "note-a", labels: ["Note"] }, { id: "note-b", labels: ["Note"] }],
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

if (typeof document !== "undefined") {
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
}

interface Props {
  graph: string;
  label: string;
  notesPage: boolean;
  variant?: string;
}

function Live({ graph, label, notesPage, variant: pageVariant, search }: Props & { search: string }) {
  const params = new URLSearchParams(search);
  const navigation = (params.get("navigation") ?? undefined) as "client-routing" | "multi-page" | undefined;
  const variant = params.get("variant") ?? pageVariant ?? "a";
  const client = useGraph(graph, { navigation, descriptor: graph === "example" ? descriptors[variant] : undefined });
  const profile = navigation ?? ((process.env.RELATED_WEB_NAVIGATION as string) === "multi-page" ? "multi-page" : "client-routing");

  useEffect(() => {
    if (!client) return;
    current = client;
    if (!watched.has(client)) {
      watched.add(client);
      client.on("timing", ({ phase, restored }) => {
        if (phase === "total") {
          restoredOf.set(client, String(restored));
          if (current === client) set("restored", String(restored));
        }
      });
    }
    const state = { status: client.status, generation: client.generation, count: "…", updates: 0, notes: "…", failure: "" };
    const render = (): void => {
      set("status", state.status);
      set("generation", String(state.generation));
      set("profile", profile === "client-routing" ? "persistent" : "per-page");
      set("instance", instance);
      set("restored", restoredOf.get(client) ?? "unknown");
      set("count", state.count);
      set("updates", String(state.updates));
      set("last-error", lastError);
      set("failure", state.failure);
      set("notes", state.notes);
      document.documentElement.dataset.gwState = state.status;
    };
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
      if (current === client) current = null;
    };
  }, [client, label, notesPage, profile]);
  return null;
}

/** Mounts the behavior once the query string is known, so the graph is asked for with the right overrides from the start. */
export function GwController(props: Props) {
  const [search, setSearch] = useState<string | null>(null);
  useEffect(() => setSearch(location.search), []);
  return search === null ? null : <Live {...props} search={search} />;
}
