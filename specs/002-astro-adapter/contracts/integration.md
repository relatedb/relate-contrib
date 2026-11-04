# Contract: the integration (`related-web-astro`)

```ts
import relatedWeb from "related-web-astro";
relatedWeb(options?: {
  graphs?: Record<string, {
    source: string;                       // path to a module (default export: () => Doc | Promise<Doc>) or a .json file
    indexes?: Array<{ label: string; property: string }>;
    lifetime?: "page" | "visit";          // default "page"
  }>;
  navigation?: "multi-page" | "client-routing";   // default "multi-page"
}): AstroIntegration;
```

**Configuration-time failures** (message names the entry): a graph name that breaks ADR-003's id rule; a duplicate name; `output` other than `"static"`; a `lifetime` or `navigation` value not listed; a missing source file.

**Build-time output** per registered graph `<name>`, under Astro's `base`:

| Path | Content |
|------|---------|
| `/_related/<name>/graph.<revision>.json` | the canonical ADR-002 document |
| `/_related/<name>/descriptor.json` | ADR-003 descriptor: `{version:1, id:<name>, revision, data:{url, nodes, links}, indexes?}` |

A document that fails the core's validator fails the build with the path of the first problem (for example `nodes[3].properties.id`).

**Dev server**: the same paths; a source that throws or is invalid leaves the server running, prints the error, and the two paths answer `500` until the next successful evaluation.

**Provided to the build**: virtual modules `virtual:related-web/config` (client) and `virtual:related-web/sources` (server only); `vite.ssr.noExternal` for the package; `optimizeDeps.exclude` for the engine.
