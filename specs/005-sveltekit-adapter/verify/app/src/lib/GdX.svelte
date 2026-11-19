<script lang="ts">
  // variant rejected: written on the server only; hydration removes the element (research V-3)
  import { escapeJson } from "@relate/contrib-web/build";
  let { id, document }: { id: string; document: unknown } = $props();
  const json = $derived(import.meta.env.SSR ? escapeJson(document) : "");
</script>
{#if import.meta.env.SSR}{@html `<script type="application/json" data-relate-graph="${id}">${json}</script>`}{/if}
