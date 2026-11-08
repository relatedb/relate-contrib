<script lang="ts">
  import engineUrl from "@relate/relate-wasm/relate_bg.wasm?url";
  import { RelateProvider } from "@relate/sveltekit";
  import { goto } from "$app/navigation";
  let { data, children } = $props();
  // for the adapter's own tests: navigation by script
  if (typeof window !== "undefined") (window as any).__goto = goto;
</script>

<RelateProvider catalog={data.catalog} {engineUrl} navigation={__NAVIGATION__}>
  {@render children()}
</RelateProvider>
