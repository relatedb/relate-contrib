<script>
  // The provider (spec FR-016): the catalog, the engine's location and the profile, in context. It creates no client and starts no worker.
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
  // An effect runs only in the browser. A pre-effect runs before the children's effects, so a child that calls `graph()` in its own
  // `onMount` finds the configuration (Svelte runs a child's `onMount` before its parent's).
  $effect.pre(() => mount(config));
</script>

{@render children?.()}
