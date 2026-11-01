// Page-scoped data layered over the shared site graph: notes about a few site
// pages, tagged with the page they belong to so they can be dropped on departure.
export const NOTES = 50;

export const SETUP = ["CREATE INDEX note_scope FOR (n:Note) ON (n.scope)"];
export const ADD_NOTES = "UNWIND $notes AS n CREATE (:Note {scope: $scope, n: n.n, text: n.text})";
export const ADD_ABOUT = "UNWIND $about AS a MATCH (n:Note {scope: $scope, n: a.n}), (p:Page {id: a.page}) CREATE (n)-[:ABOUT]->(p)";
export const DROP = "MATCH (n:Note {scope: $scope}) DETACH DELETE n";
export const COUNT_NOTES = "MATCH (n:Note) RETURN count(n) AS c";

export const overlayFor = (k, totalPages) => ({
  scope: `page-${k}`,
  notes: Array.from({length: NOTES}, (_, n) => ({n, text: `note ${n} of page ${k}`})),
  about: Array.from({length: NOTES}, (_, n) => ({n, page: (k * 7 + n * 13) % totalPages}))
});

// Works for any host that exposes query(cypher, params).
export async function overlayAdd(host, k, totalPages) {
  const o = overlayFor(k, totalPages);
  await host.query(ADD_NOTES, {notes: o.notes, scope: o.scope});
  await host.query(ADD_ABOUT, {about: o.about, scope: o.scope});
  const r = await host.query(COUNT_NOTES);
  return r.rows[0].c;
}

export const overlayDrop = (host, k) => host.query(DROP, {scope: `page-${k}`});
