<script lang="ts">
  import { locationOf } from "./paths.svelte.js";
  let { id }: { id: string } = $props();
</script>
<span id="loc">{locationOf(id)}</span>
