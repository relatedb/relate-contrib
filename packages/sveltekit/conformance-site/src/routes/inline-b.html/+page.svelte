<script lang="ts">
  import { GraphData } from "@relate/contrib-sveltekit";
  import InlineCount from "#lib/InlineCount.svelte";
  import RelPage from "#lib/RelPage.svelte";
  // the same id as inline A with other content, no `config`, and text that must not break out of its script element
  const document = {
    version: 1 as const,
    nodes: [{ id: "x", labels: ["Item"], properties: { note: "<" + "/script><b>x</b> & <" + "!-- y" } }, { id: "y", labels: ["Item"] }, { id: "z", labels: ["Item"] }],
    links: [],
  };
</script>

<RelPage title="Example site: inline B" bare>
  <GraphData id="g" {document} page="/inline-b.html" />
  <InlineCount name="g" />
</RelPage>
