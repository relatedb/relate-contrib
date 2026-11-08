<script lang="ts">
  import { onDestroy, onMount } from "svelte";
  import { visitClient } from "#lib/relate.ts";
  let count = $state("…");
  let status = $state("loading");
  let generation = $state(0);
  ((globalThis as any).__order ??= []);
  onDestroy(() => { if (typeof window !== "undefined") (globalThis as any).__order.push("destroy-a"); });
  onMount(() => {
    (globalThis as any).__order.push("mount-a");
    const client = visitClient();
    const off = client.subscribe("MATCH (n:Item) RETURN count(n) AS c", null, (u) => {
      status = u.status;
      generation = u.generation;
      if (u.rows) count = String(u.rows[0]?.c);
    });
    return off;
  });
</script>

<h1>a</h1>
<p>count <span id="count">{count}</span> status <span id="status">{status}</span> generation <span id="generation">{generation}</span></p>
