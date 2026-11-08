<script>
  // The provider (spec FR-016): the catalog, the engine's location and the profile, in context. It creates no client and starts no worker.
  import { onMount } from "svelte";
  import { mount, setConfig } from "./context.js";

  /** @type {{ catalog: import("./context.js").CatalogEntry[], engineUrl: string | URL, navigation?: "client-routing" | "multi-page", children?: import("svelte").Snippet }} */
  let { catalog, engineUrl, navigation = "client-routing", children } = $props();

  // `renderIds` is the record of inline ids used in this render: a provider instance is made per server render, so it is not shared.
  const config = {
    get catalog() {
      return catalog;
    },
    get engineUrl() {
      return engineUrl;
    },
    get profile() {
      return navigation;
    },
    renderIds: new Set(),
  };
  setConfig(config);
  onMount(() => mount(config));
</script>

{@render children?.()}
