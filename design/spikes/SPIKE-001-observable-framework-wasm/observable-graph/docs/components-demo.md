# Other components consuming CypherLite results

Every section below feeds the output of the `cypher` tagged template (an array of row objects) to a different Observable component. Element ids (`#plot-ages`, `#older-count`, ...) exist so a script can check each one.

```js
import {cypher, openDb, runScript} from "./components/graphDbClient.js";
import {toGraph} from "./components/normalize.js";
import {forceGraph} from "./components/forceGraph.js";
import {seedScript} from "./components/seed.js";

// Resolves to the tag once the database is open and seeded, so every cell
// that uses it waits for the data.
const graph = await (async () => {
  await openDb();
  await runScript(seedScript);
  return cypher;
})();
```

## Plot: bars from scalar columns

```js
const people = await graph`MATCH (p:Person) RETURN p.name AS name, p.age AS age ORDER BY age DESC`;
```

```js
const ages = Plot.plot({
  marginBottom: 40,
  marks: [Plot.barY(people, {x: "name", y: "age", sort: {x: "-y"}, tip: true}), Plot.ruleY([0])]
});
ages.id = "plot-ages";
display(ages);
```

## Plot: dots from an aggregation, with labels

```js
const friends = await graph`
  MATCH (p:Person)-[:KNOWS]-(f:Person)
  RETURN p.name AS name, p.age AS age, count(DISTINCT f) AS friends`;
```

```js
const scatter = Plot.plot({
  grid: true,
  marks: [
    Plot.dot(friends, {x: "age", y: "friends", r: 5, tip: true}),
    Plot.text(friends, {x: "age", y: "friends", text: "name", dy: -10})
  ]
});
scatter.id = "plot-friends";
display(scatter);
```

## Plot: binning raw rows

```js
const histogram = Plot.plot({
  marks: [Plot.rectY(people, Plot.binX({y: "count"}, {x: "age", thresholds: 4, tip: true})), Plot.ruleY([0])]
});
histogram.id = "plot-histogram";
display(histogram);
```

## Plot: grouping on an entity property

The rows carry whole `Person` and `City` entities (flattened), and the accessor reaches into one.

```js
const residents = await graph`MATCH (p:Person)-[:LIVES_IN]->(c:City) RETURN p, c`;
```

```js
const byCity = Plot.plot({
  marginLeft: 100,
  marks: [Plot.barX(residents, Plot.groupY({x: "count"}, {y: (d) => d.c.name, sort: {y: "-x"}})), Plot.ruleX([0])]
});
byCity.id = "plot-cities";
display(byCity);
```

## Inputs: a range slider drives a parameterized query

```js
const minAge = view(Inputs.range([20, 55], {value: 30, step: 1, label: "Minimum age"}));
```

```js
const older = await graph`MATCH (p:Person) WHERE p.age >= ${minAge} RETURN p.name AS name, p.age AS age ORDER BY age`;
display(html`<p><span id="older-count">${older.length}</span> people aged ${minAge} or more</p>`);
display(Inputs.table(older));
```

## Inputs: search over the results

```js
const found = view(Inputs.search(people, {placeholder: "Search people"}));
```

```js
display(html`<p><span id="found-count">${found.length}</span> match</p>`);
display(Inputs.table(found));
```

## Inputs: a select populated from the graph, then used as a parameter

```js
const cities = await graph`MATCH (c:City) RETURN c.name AS name ORDER BY name`;
const city = view(Inputs.select(cities.map((d) => d.name), {label: "City"}));
```

```js
const livingThere = await graph`MATCH (p:Person)-[:LIVES_IN]->(:City {name: ${city}}) RETURN p.name AS name ORDER BY name`;
display(html`<p id="living-there">${city}: ${livingThere.map((d) => d.name).join(", ")}</p>`);
```

## d3: rollups and statistics over rows

```js
const jobs = await graph`MATCH (p:Person)-[w:WORKS_AT]->(c:Company) RETURN c.name AS company, w.role AS role`;
const perCompany = Array.from(d3.rollup(jobs, (v) => v.length, (d) => d.company), ([company, n]) => ({company, n}));
display(html`<p>Mean age <span id="mean-age">${d3.mean(people, (d) => d.age).toFixed(1)}</span>; people per company
<span id="per-company">${perCompany.map((d) => `${d.company}=${d.n}`).join(", ")}</span></p>`);
```

## DuckDB: SQL over CypherLite results

A second database client (Framework's own SQL engine) loads the rows and aggregates them.

```js
import {DuckDBClient} from "npm:@observablehq/duckdb";
const duck = await DuckDBClient.of({people});
const decades = Array.from(
  await duck.sql`SELECT floor(age / 10) * 10 AS decade, count(*) AS n FROM people GROUP BY 1 ORDER BY 1`,
  (d) => ({decade: Number(d.decade), n: Number(d.n)})
);
display(html`<p id="duckdb">${decades.map((d) => `${d.decade}s=${d.n}`).join(", ")}</p>`);
```

## The graph itself

```js
const whole = await graph`MATCH (a)-[r]->(b) RETURN a, r, b`;
const chart = forceGraph(toGraph(whole.result));
invalidation.then(() => chart.stop());
chart.id = "force-graph";
display(chart);
```
