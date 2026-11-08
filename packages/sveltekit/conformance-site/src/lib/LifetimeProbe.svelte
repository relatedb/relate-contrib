<script lang="ts">
  // For the lifetime pages: a holder of a registered page-lifetime graph, with a log of what happened kept in module state so it
  // survives router navigations. The adapter's own tests read `window.__relLog`.
  import { useGraph } from "@relate/sveltekit";
  import type { Client } from "@relate/web";

  let { name = "small", label = "Item", title }: { name?: string; label?: string; title: string } = $props();
  type Win = { __relLog?: string[]; __relClient?: Client };
  const win = (typeof window === "undefined" ? {} : window) as Win;
  const log = (win.__relLog ??= []);
  const ids = ((globalThis as any).__relIds ??= new WeakMap<Client, number>()) as WeakMap<Client, number>;
  const handle = useGraph(name);
  let status = $state("idle");
  let count = $state("…");
  let restored = $state("unknown");

  $effect(() => {
    const client = handle.client;
    if (!client) return;
    if (!ids.has(client)) {
      ids.set(client, ((globalThis as any).__relMade = ((globalThis as any).__relMade ?? 0) + 1));
      log.push(`client:${ids.get(client)}:${title}`);
      const destroy = client.destroy.bind(client);
      client.destroy = () => {
        log.push(`destroy:${ids.get(client)}:${title}`);
        try {
          sessionStorage.setItem("rel-destroyed", [sessionStorage.getItem("rel-destroyed"), title].filter(Boolean).join("|"));
        } catch {
          /* storage may be unavailable */
        }
        destroy();
      };
    }
    log.push(`hold:${ids.get(client)}:${title}`);
    status = client.status;
    win.__relClient = client;
    const offs = [
      client.on("status", ({ status: s }) => (status = s)),
      client.on("timing", ({ phase, restored: r }) => phase === "total" && (restored = String(r))),
      client.subscribe(`MATCH (n:${label}) RETURN count(n) AS c`, null, (u) => u.rows && (count = String(u.rows[0]?.c))),
    ];
    return () => {
      log.push(`release:${ids.get(client)}:${title}`);
      offs.forEach((off) => off());
    };
  });
</script>

<p>Graph <span data-life-name>{name}</span>: status <span data-life-status>{status}</span> · count <span data-life-count>{count}</span> · restored <span data-life-restored>{restored}</span></p>
