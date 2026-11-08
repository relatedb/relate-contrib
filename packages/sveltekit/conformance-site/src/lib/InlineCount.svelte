<script lang="ts">
  // For the pages that carry inline graphs: asks for the graph, counts its nodes and reads one property, and exposes the clients
  // for the adapter's own tests (`window.__relClients`).
  import { useGraph, useQuery } from "@relate/sveltekit";
  import type { Client } from "@relate/web";

  let { name }: { name: string } = $props();
  const handle = useGraph(name);
  const count = useQuery(name, "MATCH (n:Item) RETURN count(n) AS c");
  const note = useQuery(name, "MATCH (n:Item) WHERE n.note IS NOT NULL RETURN n.note AS note LIMIT 1");
  $effect(() => {
    const client = handle.client;
    if (!client) return;
    const clients = ((window as any).__relClients ??= {}) as Record<string, Client>;
    clients[name] = client;
  });
</script>

<p>Graph <span data-inline-name>{name}</span>: status <span data-inline-status>{count.status}</span> · nodes <span data-inline-count>{count.rows ? count.rows[0]?.c : "…"}</span> · note <span data-inline-note>{note.rows?.[0]?.note ?? ""}</span> · generation <span data-inline-generation>{count.generation}</span></p>
