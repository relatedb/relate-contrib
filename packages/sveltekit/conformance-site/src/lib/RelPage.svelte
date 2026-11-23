<script module lang="ts">
  // one per document, as in the other conformance sites: the same instance serves every page of a visit under client-routing
  const instance = Math.random().toString(36).slice(2, 8);
</script>

<script lang="ts">
  // The markup the core's conformance scenarios drive (packages/web/conformance/example-site/rel-page.ts): every observable thing is a
  // `data-rel-*` element. The behavior is written against `@relate/contrib-sveltekit` only. Query parameters: `navigation` (the profile) and
  // `variant` (a, b, mismatch, broken: which descriptor the shared graph uses).
  import { useGraph } from "@relate/contrib-sveltekit";
  import { attachView } from "@relate/contrib-web";
  import type { Client, View } from "@relate/contrib-web";
  import Nav from "./Nav.svelte";

  let { title, graph = "example", label = "Page", notesPage = false, variant: pageVariant, bare = false, children }: { title: string; graph?: string; label?: string; notesPage?: boolean; variant?: string; bare?: boolean; children?: import("svelte").Snippet } = $props();

  const descriptors: Record<string, string | undefined> = { a: undefined, b: "/descriptor-b.json", mismatch: "/descriptor-mismatch.json", broken: "/descriptor-broken.json" };
  const params = typeof location === "undefined" ? new URLSearchParams() : new URLSearchParams(location.search);
  const navigation = (params.get("navigation") ?? undefined) as "client-routing" | "multi-page" | undefined;
  const variant = params.get("variant") ?? pageVariant ?? "a";
  const handle = bare ? null : useGraph(graph, { navigation, descriptor: graph === "example" ? descriptors[variant] : undefined });
  const profile = navigation ?? __NAVIGATION__;

  const trap = `RETURN ${"1+".repeat(200000)}1 AS x`;
  const runaway = "MATCH (a:Page), (b:Page), (c:Page) RETURN count(*) AS c";
  const notes = { version: 1 as const, nodes: [{ id: "note-a", labels: ["Note"] }, { id: "note-b", labels: ["Note"] }], links: [{ source: "note-a", target: "note-b", type: "ABOUT" }] };

  const restoredOf = new WeakMap<Client, string>();
  let state = $state({ status: "loading", generation: 0, count: "…", updates: 0, notes: "…", failure: "", lastError: "", restored: "unknown", instance: "" });

  $effect(() => {
    const client = handle?.client;
    if (!client) return;
    state.instance = instance;
    state.status = client.status;
    state.generation = client.generation;
    state.restored = restoredOf.get(client) ?? "unknown";
    (window as any).__rel = { client };
    const offs: Array<() => void> = [];
    offs.push(client.on("timing", ({ phase, restored }) => {
      if (phase === "total") {
        restoredOf.set(client, String(restored));
        state.restored = String(restored);
      }
    }));
    offs.push(client.on("status", ({ status, generation }) => {
      state.status = status;
      state.generation = generation;
      state.failure = status === "failed" ? client.failureMessage() : "";
      document.documentElement.dataset.relState = status;
    }));
    offs.push(client.subscribe(`MATCH (n:${label}) RETURN count(n) AS c`, null, (u) => {
      state.status = u.status;
      state.generation = u.generation;
      if (u.rows) {
        state.count = String(u.rows[0]?.c);
        state.updates++;
      }
      document.documentElement.dataset.relState = u.status;
    }));
    let view: View | null = null;
    if (notesPage) {
      // Subscribe once the view's data is in: a subscription made while the data is still being added would show the count before
      // the add, and nothing re-runs it until the next replacement.
      const mine = (view = attachView(client, notes));
      void mine.ready.then(() => {
        if (view !== mine) return;
        offs.push(client.subscribe("MATCH (n:Note) RETURN count(n) AS c", null, (u) => { if (u.rows) state.notes = String(u.rows[0]?.c); }));
      });
    }
    return () => {
      for (const off of offs) off();
      void view?.detach();
      view = null;
    };
  });

  function act(action: "trap" | "timeout"): void {
    const client = handle?.client;
    if (!client) return;
    const record = (err: { reason: string }): void => void (state.lastError = err.reason);
    if (action === "trap") void client.query(trap).catch(record);
    else void client.query(runaway, null, { timeoutMs: 400 }).catch(record);
  }
</script>

<main>
  <h1 data-rel-title>{title}</h1>
  <Nav />
  {@render children?.()}
  {#if !bare}
    <section>
      <p>Status: <span data-rel-status>{state.status}</span> · generation <span data-rel-generation>{state.generation}</span> · profile <span data-rel-profile>{profile === "client-routing" ? "persistent" : "per-page"}</span> · instance <span data-rel-instance>{state.instance}</span> · restored <span data-rel-restored>{state.restored}</span></p>
      <p>Pages in the graph: <span data-rel-count>{state.count}</span> · updates <span data-rel-updates>{state.updates}</span> · last error <span data-rel-last-error>{state.lastError}</span></p>
      <p data-rel-failure>{state.failure}</p>
      <p data-rel-notes-row hidden={!notesPage}>Notes: <span data-rel-notes>{state.notes}</span></p>
      <p>
        <button type="button" data-rel-action="trap" onclick={() => act("trap")}>Run a statement that crashes the engine</button>
        <button type="button" data-rel-action="timeout" onclick={() => act("timeout")}>Run a statement that never ends (0.4 s timeout)</button>
      </p>
    </section>
  {/if}
</main>
