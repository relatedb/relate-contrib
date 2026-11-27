# Quickstart: observing a client

```ts
const client = createClient({ engineUrl, application: { name: "notes", version: 1, seed }, navigation: "multi-page" });
client.on("statement", (s) => console.log(s.origin, s.write, s.ms, s.statement));
client.on("revision", ({ revision }) => console.log("changed", revision));
await client.query("CREATE (:Note {t: 'x'})");   // statement: origin "query", write true; revision +1
console.log(client.info);                          // { name: "app-notes", kind: "application", readOnly: false, engine: "1.4.0" }
```

Validate: `pnpm --filter @relate/contrib-web test:observability` (Node, real engine), `pnpm test:observability-browsers`, `pnpm test:observability-trace`.
