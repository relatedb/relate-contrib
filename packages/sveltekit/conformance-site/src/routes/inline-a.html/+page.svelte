<script lang="ts">
  import { GraphData } from "@relate/contrib-sveltekit";
  import InlineCount from "#lib/InlineCount.svelte";
  import RelPage from "#lib/RelPage.svelte";
  import { small } from "#lib/documents.ts";
  // an inline graph with `config` indexes
  const document = small();
</script>

<RelPage title="Example site: inline A" bare>
  <GraphData id="g" {document} config={{ indexes: [{ label: "Item", property: "id" }] }} page="/inline-a.html" />
  <InlineCount name="g" />
</RelPage>
