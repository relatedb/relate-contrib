// The behavior shared by the conformance pages, written against `@relate/observable`. Every observable thing is a `data-rel-*`
// element, the contract the core's conformance scenarios drive (packages/web/conformance/example-site/rel-page.ts).
//
// Query parameters: variant=a|b|mismatch|broken (which descriptor). Only the per-page profile exists in this framework.
import {open} from "@relate/observable";
import {attachView} from "@relate/web";
import {engine, variants, worker} from "./files.js";

const trap = `RETURN ${"(".repeat(1000)}1${")".repeat(1000)} AS x`;
const runaway = "MATCH (a:Page), (b:Page), (c:Page) RETURN count(*) AS c";
const notes = {
  version: 1,
  nodes: [{id: "note-a", labels: ["Note"]}, {id: "note-b", labels: ["Note"]}],
  links: [{source: "note-a", target: "note-b", type: "ABOUT"}]
};

const set = (name, value) => {
  const el = document.querySelector(`[data-rel-${name}]`);
  if (el) el.textContent = value;
};

/** Start the page: open the example graph (the variant the page or the address asks for) and drive the markup. */
export async function startRelPage(invalidation) {
  const marker = document.querySelector("[data-rel-page]")?.dataset ?? {};
  const variant = new URLSearchParams(location.search).get("variant") ?? marker.relVariant ?? "a";
  const notesPage = "relNotesPage" in marker;
  const instance = Math.random().toString(36).slice(2, 8);
  const db = await open({engine, worker, graph: variants[variant] ?? variants.a, invalidation});
  const client = db.client;
  window.__rel = {client, db};

  const state = {status: client.status, generation: client.generation, count: "…", updates: 0, lastError: "", notes: "…", restored: "unknown", failure: ""};
  const render = () => {
    set("status", state.status);
    set("generation", String(state.generation));
    set("profile", "per-page");
    set("instance", instance);
    set("restored", state.restored);
    set("count", state.count);
    set("updates", String(state.updates));
    set("last-error", state.lastError);
    set("failure", state.failure);
    set("notes", state.notes);
    document.documentElement.dataset.relState = state.status;
  };
  client.on("status", ({status, generation}) => {
    state.status = status;
    state.generation = generation;
    state.failure = status === "failed" ? client.failureMessage() : "";
    render();
  });
  client.on("timing", ({phase, restored}) => {
    if (phase === "total") {
      state.restored = String(restored);
      render();
    }
  });

  const unsubscribe = [];
  let view = null;
  document.querySelector("[data-rel-notes-row]")?.toggleAttribute("hidden", !notesPage);
  unsubscribe.push(
    client.subscribe("MATCH (n:Page) RETURN count(n) AS c", null, (u) => {
      state.status = u.status;
      state.generation = u.generation;
      if (u.rows) {
        state.count = String(u.rows[0]?.c);
        state.updates++;
      }
      render();
    })
  );
  if (notesPage) {
    // Subscribe once the view's data is in: a subscription made while the data is still being added would show the count
    // before the add, and nothing re-runs it until the next replacement.
    const mine = (view = attachView(client, notes));
    void mine.ready.then(() => {
      if (view !== mine) return;
      unsubscribe.push(
        client.subscribe("MATCH (n:Note) RETURN count(n) AS c", null, (u) => {
          if (u.rows) state.notes = String(u.rows[0]?.c);
          render();
        })
      );
    });
  }
  render();

  const depart = () => {
    for (const off of unsubscribe) off();
    unsubscribe.length = 0;
    void view?.detach();
    view = null;
  };
  const onClick = (e) => {
    const action = e.target?.closest?.("[data-rel-action]")?.getAttribute("data-rel-action");
    const record = (err) => ((state.lastError = err.reason), render());
    if (action === "trap") void client.query(trap).catch(record);
    else if (action === "timeout") void client.query(runaway, null, {timeoutMs: 400}).catch(record);
  };
  document.addEventListener("click", onClick);
  window.addEventListener("pagehide", depart);
  invalidation.then(() => {
    depart();
    document.removeEventListener("click", onClick);
    window.removeEventListener("pagehide", depart);
  });
  return db;
}
