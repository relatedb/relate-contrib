# Probe: raw wire envelopes

```js
import {openDb, rawQuery, runScript} from "./components/graphDbClient.js";
import {seedScript} from "./components/seed.js";
const {timings} = await openDb();
const seeded = await runScript(seedScript);
```

```js
display(html`<pre>${JSON.stringify({timings, seedErrors: seeded.map((e) => e.error)}, null, 2)}</pre>`);
```

```js
const cases = {
  scalars: "MATCH (p:Person) RETURN p.name AS name, p.age AS age ORDER BY age DESC LIMIT 2",
  entities: "MATCH (p:Person)-[r:WORKS_AT]->(c:Company {name: 'Neo4j'}) RETURN p, r, c LIMIT 1",
  path: "MATCH path = (a:Person {name: 'Alice'})-[:KNOWS*2..3]->(o:Person) WHERE o.name <> 'Alice' RETURN path LIMIT 1",
  error: "MATCH (p:Person RETURN p",
  empty: "MATCH (p:Nope) RETURN p"
};
const out = Object.fromEntries(
  await Promise.all(Object.entries(cases).map(async ([k, q]) => [k, await rawQuery(q)]))
);
display(html`<pre>${JSON.stringify(out, null, 2)}</pre>`);
```
