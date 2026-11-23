<script lang="ts">
  import { GraphData } from "@relate/contrib-sveltekit";
  import InlineCount from "#lib/InlineCount.svelte";
  import RelPage from "#lib/RelPage.svelte";
  import { sized, small } from "#lib/documents.ts";
  const first = small();
  const second = sized(5);
  const trap = `RETURN ${"1+".repeat(200000)}1 AS x`;
</script>

<RelPage title="Example site: two graphs" bare>
  <GraphData id="first" document={first} page="/two-graphs.html" />
  <GraphData id="second" document={second} page="/two-graphs.html" />
  <InlineCount name="first" />
  <InlineCount name="second" label="Page" />
  <p><button type="button" data-trap-first onclick={() => (window as any).__relClients?.first.query(trap).catch(() => undefined)}>Crash the first graph's engine</button></p>
</RelPage>
