<script lang="ts">
  import { onDestroy, onMount } from "svelte";
  // a page that reads the instance in its first render: on the server there is none, so it must not matter
  import { visitClient } from "#lib/relate.ts";
  const early = typeof window === "undefined" ? "server" : visitClient().status;
  let mounted = $state("no");
  const log: string[] = [];
  onMount(() => { mounted = "yes"; });
  onDestroy(() => { log.push("destroy"); console.log("[early] onDestroy ran, window is " + typeof window); });
  onMount(() => { console.log("[early] onMount ran"); });
  $effect(() => { console.log("[early] effect ran"); });
  console.log("[early] script ran, window is " + typeof window);
  $effect(() => { (globalThis as any).__effectRan = true; });
</script>

<h1>Early</h1>
<p>first render saw <span id="early">{early}</span>, mounted <span id="mounted">{mounted}</span></p>
