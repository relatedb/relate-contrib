// Generates src/seed.json, the demo's graph data document (ADR-002): 6 companies, 50 people and 10 projects. Everything is
// derived from the index of each node and fixed lists, so running it twice gives the same file. The names are made up.
//
// usage: pnpm seed
import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

interface Node {
  id: string;
  labels: string[];
  properties: Record<string, string | number | boolean>;
}
interface Link {
  source: string;
  target: string;
  type: string;
}
export interface Seed {
  version: 1;
  nodes: Node[];
  links: Link[];
}

const COMPANIES: Array<[string, string, number]> = [
  ["Northwind Labs", "software", 2008],
  ["Harbor & Finch", "logistics", 1994],
  ["Lumen Works", "energy", 2012],
  ["Pine Street Press", "media", 1987],
  ["Quill Analytics", "software", 2016],
  ["Tidewater Foods", "food", 2001],
];
const FIRST = ["Avery", "Blake", "Casey", "Devon", "Emery", "Finley", "Harper", "Jordan", "Kai", "Logan"];
const LAST = ["Ashford", "Brooks", "Calder", "Dunmore", "Ellery"];
const TITLES = ["engineer", "designer", "analyst", "manager", "researcher", "coordinator", "editor", "technician"];
const PROJECTS = ["Atlas", "Borealis", "Cascade", "Delta", "Ember", "Fjord", "Garnet", "Helix", "Isthmus", "Juniper"];
const STATUSES = ["planned", "active", "active", "done"];

const pad = (n: number): string => String(n).padStart(2, "0");

export function makeSeed(): Seed {
  const nodes: Node[] = [];
  const links: Link[] = [];

  COMPANIES.forEach(([name, industry, founded], i) => {
    nodes.push({ id: `c${pad(i + 1)}`, labels: ["Company"], properties: { name, industry, founded } });
  });

  for (let i = 0; i < 50; i++) {
    const id = `p${pad(i + 1)}`;
    nodes.push({
      id,
      labels: ["Person"],
      properties: {
        name: `${FIRST[i % FIRST.length]} ${LAST[Math.floor(i / FIRST.length)]}`,
        title: TITLES[(i * 3) % TITLES.length]!,
        age: 22 + ((i * 7) % 39),
        active: i % 5 !== 0,
      },
    });
    links.push({ source: id, target: `c${pad((i % COMPANIES.length) + 1)}`, type: "WORKS_AT" });
  }

  PROJECTS.forEach((name, i) => {
    const id = `j${pad(i + 1)}`;
    const company = i % COMPANIES.length;
    // the lead is a person who works at the project's company: person j works at company j % 6
    const lead = company + COMPANIES.length * Math.floor(i / COMPANIES.length);
    nodes.push({ id, labels: ["Project"], properties: { name, status: STATUSES[i % STATUSES.length]!, budget: (i + 1) * 25_000 } });
    links.push({ source: id, target: `c${pad(company + 1)}`, type: "OWNED_BY" });
    links.push({ source: id, target: `p${pad(lead + 1)}`, type: "LED_BY" });
  });

  return { version: 1, nodes, links };
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const out = fileURLToPath(new URL("../src/seed.json", import.meta.url));
  writeFileSync(out, JSON.stringify(makeSeed(), null, 2) + "\n");
  console.log(`wrote ${out}`);
}
