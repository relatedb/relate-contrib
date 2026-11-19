<script lang="ts">
  import { useQuery } from "@relate/contrib-sveltekit";
  import RelPage from "#lib/RelPage.svelte";
  // one holder whose id changes: it must release the old graph and acquire the new one
  let which = $state("small");
  const count = useQuery(() => which, "MATCH (n) RETURN count(n) AS c");
</script>

<RelPage title="Example site: switch" bare>
  <p>Graph <span data-switch-id>{which}</span>: status <span data-switch-status>{count.status}</span> · nodes <span data-switch-count>{count.rows ? count.rows[0]?.c : "…"}</span></p>
  <p><button type="button" data-switch-toggle onclick={() => (which = which === "small" ? "other" : "small")}>Switch graph</button></p>
</RelPage>
