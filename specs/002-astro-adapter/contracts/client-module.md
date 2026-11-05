# Contract: the client module (`@relate/web-astro/client`)

```ts
import { onPage, graph } from "@relate/web-astro/client";

onPage(
  (page) => {
    const client = page.graph("recipe");        // inline first, then registered; the core's Client
    const off = client.subscribe(/* ... */);
    return () => off();                          // optional cleanup, also run by the module's own destruction of page clients
  },
  { selector: "[data-recipe]" },                 // D-2, optional: run only on pages where this matches (default: every page)
);

const site = graph("site");                      // visit-lifetime registered graphs only
```

| Behavior | Rule |
|----------|------|
| First load | setup runs once when the DOM is ready, with or without the router; the router's first `astro:page-load` for the document does not run it again |
| Arrival | setup runs on each later `astro:page-load` (where the selector matches) |
| Departure | the cleanup runs on `astro:before-swap` and on `pagehide`; every page-lifetime client created through `page.graph` is destroyed then; the departing page finishes before the next page's setup |
| `page.graph(name, options?)` | returns the core client for the page; asking again returns the same client; `"page"` lifetime: `createClient`, `store: true` when the descriptor exists, destroyed on departure; `"visit"` lifetime: `createSiteClient` (retained under `client-routing`, one per page under `multi-page`) |
| `graph(name, options?)` | visit-lifetime registered graphs only; throws naming the graph for inline or page-lifetime names; throws listing registered names for unknown names |
| `options` | `{ navigation?: "multi-page" \| "client-routing"; descriptor?: string }` — both are testing aids; `descriptor` is D-1 and changes nothing but the descriptor URL used |
| Never started early | importing the module starts no client |
| Dev only | a warning when the configured `navigation` disagrees with the presence of the router's `astro-view-transitions-enabled` meta tag; none in a production build |

Status, generation, events, `failed` and retry pass through the core's client unaltered (FR-025).
