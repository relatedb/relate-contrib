<script lang="ts">
  import { GraphData, graph } from "@relate/contrib-sveltekit";
  import { onMount } from "svelte";
  import RelPage from "#lib/RelPage.svelte";
  import { small } from "#lib/documents.ts";
  const document = small();
  const results = $state<Record<string, string>>({ visit: "…", page: "…", inline: "…", unknown: "…", twice: "…" });
  onMount(() => {
    const attempt = (key: string, id: string): void => {
      try {
        const client = graph(id);
        results[key] = client ? "client" : "none";
      } catch (e) {
        results[key] = e instanceof Error ? e.message : String(e);
      }
    };
    attempt("visit", "example");
    attempt("page", "small");
    attempt("inline", "g");
    attempt("unknown", "nothing");
    try {
      results.twice = String(graph("example") === graph("example"));
    } catch (e) {
      results.twice = String(e);
    }
  });
</script>

<RelPage title="Example site: direct" bare>
  <GraphData id="g" {document} page="/direct.html" />
  <p>visit: <span data-direct-visit>{results.visit}</span></p>
  <p>same client twice: <span data-direct-twice>{results.twice}</span></p>
  <p>page lifetime: <span data-direct-page>{results.page}</span></p>
  <p>inline: <span data-direct-inline>{results.inline}</span></p>
  <p>unknown: <span data-direct-unknown>{results.unknown}</span></p>
</RelPage>
