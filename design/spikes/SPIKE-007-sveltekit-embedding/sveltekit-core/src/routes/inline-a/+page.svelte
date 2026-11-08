<script lang="ts">
  import { onMount } from "svelte";
  import GraphData from "#lib/GraphData.svelte";
  const document = { version: 1, nodes: [{ id: "a", labels: ["Item"], properties: { note: "<" + "/script><b>x</b> & <" + "!-- y" } }], links: [] };
  let found = $state("…");
  onMount(() => {
    const els = globalThis.document.querySelectorAll('script[data-relate-graph="g"]');
    found = els.length + ":" + JSON.parse(els[els.length - 1]!.textContent!).nodes[0].id + ":" + JSON.parse(els[els.length - 1]!.textContent!).nodes[0].properties.note;
  });
</script>

<h1>Inline a</h1>
<GraphData id="g" {document} />
<p>found <span id="found">{found}</span></p>
