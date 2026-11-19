<script lang="ts">
  import { escapeJson } from "@relate/contrib-web/build";
  let { id, document }: { id: string; document: unknown } = $props();
  const json = $derived(escapeJson(document));
</script>

{@html `<script type="application/json" data-relate-graph="${id}">${json}</script>`}
