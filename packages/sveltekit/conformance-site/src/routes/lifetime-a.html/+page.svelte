<script lang="ts">
  import LifetimeProbe from "#lib/LifetimeProbe.svelte";
  import RelPage from "#lib/RelPage.svelte";
</script>

<RelPage title="Example site: lifetime A" bare>
  <LifetimeProbe name="small" title="lifetime A" />
  <LifetimeProbe name="small" title="lifetime A (second holder)" />
</RelPage>
