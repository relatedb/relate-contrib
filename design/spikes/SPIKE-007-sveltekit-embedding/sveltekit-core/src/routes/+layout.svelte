<script lang="ts">
  import { goto } from "$app/navigation";
  import { resolve } from "$app/paths";
  let { children } = $props();
  (globalThis as any).__goto = goto;
</script>

<nav>
  <a href={resolve("/")}>Home</a> <a href={resolve("/a")}>A</a> <a href={resolve("/b")}>B</a> <a href={resolve("/early")}>Early</a> <a href={resolve("/inline-a")}>InlineA</a> <a href={resolve("/inline-b")}>InlineB</a> <a href={resolve("/outside.html" as any)} data-sveltekit-reload>Outside</a>
</nav>
{@render children()}
