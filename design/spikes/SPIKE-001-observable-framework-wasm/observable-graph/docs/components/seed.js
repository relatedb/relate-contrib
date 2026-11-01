// A small hand-written graph used to exercise the integration. Loaded with the
// engine's own script runner so a page can reset and reseed in one call.
export const seedScript = `
CREATE (alice:Person {name: 'Alice', age: 34}),
       (bob:Person {name: 'Bob', age: 41}),
       (carol:Person {name: 'Carol', age: 29}),
       (dave:Person {name: 'Dave', age: 52}),
       (erin:Person {name: 'Erin', age: 38}),
       (neo:Company {name: 'Neo4j'}),
       (acme:Company {name: 'Acme'}),
       (malmo:City {name: 'Malmo'}),
       (london:City {name: 'London'}),
       (sf:City {name: 'San Francisco'}),
       (alice)-[:KNOWS {since: 2015}]->(bob),
       (bob)-[:KNOWS {since: 2018}]->(carol),
       (carol)-[:KNOWS {since: 2020}]->(dave),
       (alice)-[:KNOWS {since: 2012}]->(erin),
       (erin)-[:KNOWS {since: 2019}]->(dave),
       (alice)-[:WORKS_AT {role: 'Engineer'}]->(neo),
       (bob)-[:WORKS_AT {role: 'Designer'}]->(neo),
       (carol)-[:WORKS_AT {role: 'Analyst'}]->(acme),
       (dave)-[:WORKS_AT {role: 'Director'}]->(acme),
       (erin)-[:WORKS_AT {role: 'Engineer'}]->(neo),
       (alice)-[:LIVES_IN]->(malmo),
       (bob)-[:LIVES_IN]->(london),
       (carol)-[:LIVES_IN]->(london),
       (dave)-[:LIVES_IN]->(sf),
       (erin)-[:LIVES_IN]->(malmo)
`;

export const sampleQueries = [
  {
    label: "Colleagues at Neo4j",
    query: "MATCH (p:Person)-[r:WORKS_AT]->(c:Company {name: 'Neo4j'}) RETURN p, r, c"
  },
  {
    label: "Friends of friends (paths)",
    query:
      "MATCH path = (a:Person {name: 'Alice'})-[:KNOWS*2..3]->(o:Person) WHERE o.name <> 'Alice' RETURN path LIMIT 10"
  },
  {
    label: "People ordered by age",
    query: "MATCH (p:Person) RETURN p.name AS name, p.age AS age ORDER BY age DESC"
  },
  {
    label: "Whole graph",
    query: "MATCH (a)-[r]->(b) RETURN a, r, b"
  }
];
