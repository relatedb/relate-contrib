<script lang="ts">
  import { resolve } from "$app/paths";
  const pages: Array<[string, string]> = [["Home", "/"], ["Page 1", "/page-1.html"], ["Page 2", "/page-2.html"], ["Notes", "/notes.html"], ["Broken", "/broken.html"], ["Inline A", "/inline-a.html"], ["Inline B", "/inline-b.html"], ["Two graphs", "/two-graphs.html"], ["Lifetime A", "/lifetime-a.html"], ["Lifetime B", "/lifetime-b.html"], ["Lifetime C", "/lifetime-c.html"], ["Direct", "/direct.html"], ["Switch", "/switch.html"], ["Live", "/live.html"]];
</script>

<nav>
  {#each pages as [label, path]}
    <a data-rel-link href={resolve(path as any)}>{label}</a>
  {/each}
</nav>
