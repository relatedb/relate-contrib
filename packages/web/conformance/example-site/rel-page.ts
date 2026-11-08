// The behavior shared by the example pages. It is the contract the conformance check drives: every observable
// thing is a `data-rel-*` element or attribute, so an adapter's pages only have to produce the same markup.
//
// Query parameters: navigation=client-routing|multi-page (the profile), variant=a|b|mismatch|broken (which
// descriptor), __break=no-rerun (a deliberately broken variant used to test the check itself).
import engineUrl from "@neo4j-labs/cypherlite-wasm/cypherlite_bg.wasm?url";
import { attachView, createSiteClient } from "@relate/web";
import type { View } from "@relate/web";

const params = new URLSearchParams(location.search);
const navigation = (params.get("navigation") ?? "multi-page") as "client-routing" | "multi-page";
const variant = params.get("variant") ?? document.body.dataset.relVariant ?? "a";
const descriptors: Record<string, string> = {
  a: "/descriptor.json",
  b: "/descriptor-b.json",
  mismatch: "/descriptor-mismatch.json",
  broken: "/descriptor-broken.json",
};
const instance = Math.random().toString(36).slice(2, 8);

const client = createSiteClient({
  engineUrl,
  graph: { descriptor: descriptors[variant] ?? "/descriptor.json" },
  navigation,
  issueUrl: "https://example.org/issues",
});

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

const state = { status: client.status, generation: client.generation, count: "…", updates: 0, lastError: "", notes: "…", restored: "unknown", failure: "" };
const set = (name: string, value: string): void => {
  const el = document.querySelector(`[data-rel-${name}]`);
  if (el) el.textContent = value;
};

function render(): void {
  set("status", state.status);
  set("generation", String(state.generation));
  set("profile", navigation === "client-routing" ? "persistent" : "per-page");
  set("instance", instance);
  set("restored", state.restored);
  set("count", state.count);
  set("updates", String(state.updates));
  set("last-error", state.lastError);
  set("failure", state.failure);
  set("notes", state.notes);
  // the status as an attribute of <html>, so a scenario can wait for it without matching the status element
  document.documentElement.dataset.relState = state.status;
}

client.on("status", ({ status, generation }) => {
  state.status = status;
  state.generation = generation;
  state.failure = status === "failed" ? client.failureMessage() : "";
  render();
});
client.on("timing", ({ phase, restored }) => {
  if (phase === "total") {
    state.restored = String(restored);
    render();
  }
});

let unsubscribe: Array<() => void> = [];
let view: View | null = null;

function arrive(): void {
  state.count = "…";
  state.notes = "…";
  const notesPage = "relNotesPage" in document.body.dataset;
  document.querySelector("[data-rel-notes-row]")?.toggleAttribute("hidden", !notesPage);
  const off = client.subscribe("MATCH (n:Page) RETURN count(n) AS c", null, (u) => {
    state.status = u.status;
    state.generation = u.generation;
    if (u.rows) {
      state.count = String(u.rows[0]?.c);
      state.updates++;
      if (params.get("__break") === "no-rerun") off(); // a deliberately broken variant: no re-run after a replacement
    }
    render();
  });
  unsubscribe.push(off);
  if (notesPage) {
    // Subscribe once the view's data is in: a subscription made while the data is still being added would
    // show the count before the add, and nothing re-runs it until the next replacement.
    const mine = (view = attachView(client, notes));
    void mine.ready.then(() => {
      if (view !== mine) return; // the page was left before the data arrived
      unsubscribe.push(
        client.subscribe("MATCH (n:Note) RETURN count(n) AS c", null, (u) => {
          if (u.rows) state.notes = String(u.rows[0]?.c);
          render();
        }),
      );
    });
  }
  render();
}

function depart(): void {
  for (const off of unsubscribe) off();
  unsubscribe = [];
  void view?.detach();
  view = null;
}

document.addEventListener("click", (e) => {
  const target = e.target as Element | null;
  const action = target?.closest("[data-rel-action]")?.getAttribute("data-rel-action");
  if (action === "trap") {
    void client.query(trap).catch((err: { reason: string }) => ((state.lastError = err.reason), render()));
  } else if (action === "timeout") {
    void client.query(runaway, null, { timeoutMs: 400 }).catch((err: { reason: string }) => ((state.lastError = err.reason), render()));
  } else if (navigation === "client-routing") {
    // Client-side routing: fetch the next page and swap its <main>, so this module (and the client) stays alive.
    const a = target?.closest("a[data-rel-link]") as HTMLAnchorElement | null;
    if (a && !e.defaultPrevented && e.button === 0 && !e.metaKey && !e.ctrlKey && !e.shiftKey) {
      e.preventDefault();
      void go(a.href, true);
    }
  }
});

async function go(href: string, push: boolean): Promise<void> {
  const html = await (await fetch(href)).text();
  const next = new DOMParser().parseFromString(html, "text/html");
  depart();
  document.querySelector("main")!.innerHTML = next.querySelector("main")!.innerHTML;
  document.title = next.title;
  document.body.removeAttribute("data-rel-notes-page");
  if (next.body.hasAttribute("data-rel-notes-page")) document.body.setAttribute("data-rel-notes-page", "");
  if (push) history.pushState({}, "", href);
  arrive();
}
if (navigation === "client-routing") window.addEventListener("popstate", () => void go(location.href, false));
if (navigation === "multi-page") window.addEventListener("pagehide", depart);

arrive();
