// A small schema in the shape of the demo's (data-model.md "Demo data") and data to match, with the cases the tests need:
// ties in `age`, a person with no `age`, names that differ only in letter case, and references of both kinds.
import type { Schema } from "../../src/schema.js";

export const schema: Schema = {
  resources: {
    companies: {
      label: "Company",
      fields: [
        { name: "name", type: "string", sortable: true, filterable: true, searchable: true },
        { name: "industry", type: "string", sortable: true, filterable: true },
        { name: "founded", type: "number", sortable: true, filterable: true },
      ],
    },
    people: {
      label: "Person",
      fields: [
        { name: "name", type: "string", sortable: true, filterable: true, searchable: true },
        { name: "title", type: "string", filterable: true, searchable: true },
        { name: "age", type: "number", sortable: true, filterable: true },
        { name: "active", type: "boolean", filterable: true },
      ],
      references: [{ field: "company", resource: "companies", type: "WORKS_AT" }],
    },
    projects: {
      label: "Project",
      fields: [
        { name: "name", type: "string", sortable: true, filterable: true, searchable: true },
        { name: "status", type: "string", sortable: true, filterable: true },
        { name: "budget", type: "number", sortable: true, filterable: true },
      ],
      references: [
        { field: "company", resource: "companies", type: "OWNED_BY" },
        { field: "lead", resource: "people", type: "LED_BY" },
      ],
    },
  },
};

export const companies = [
  { id: "c1", name: "Acme", industry: "tools", founded: 1990 },
  { id: "c2", name: "Beta Works", industry: "software", founded: 2005 },
  { id: "c3", name: "Gamma", industry: "software", founded: 2015 },
];

// Person p11 has no `age`; p03 and p04 and p05 share age 30; p01 and p02 differ only in the case of the name.
export const people: Array<{ id: string; name: string; title: string; age?: number; active: boolean; company: string | null }> = [
  { id: "p01", name: "Ada", title: "engineer", age: 36, active: true, company: "c1" },
  { id: "p02", name: "ada Lovelace", title: "analyst", age: 28, active: true, company: "c1" },
  { id: "p03", name: "Bo", title: "engineer", age: 30, active: true, company: "c2" },
  { id: "p04", name: "Cy", title: "designer", age: 30, active: false, company: "c2" },
  { id: "p05", name: "Di", title: "engineer", age: 30, active: true, company: "c3" },
  { id: "p06", name: "Eve", title: "manager", age: 45, active: true, company: "c1" },
  { id: "p07", name: "Fay", title: "designer", age: 22, active: false, company: "c3" },
  { id: "p08", name: "Gus", title: "engineer", age: 51, active: true, company: null },
  { id: "p09", name: "Hal", title: "analyst", age: 33, active: true, company: "c2" },
  { id: "p10", name: "Ivy", title: "engineer", age: 27, active: false, company: "c1" },
  { id: "p11", name: "Jo", title: "manager", active: true, company: "c3" },
  { id: "p12", name: "Kit", title: "designer", age: 41, active: true, company: "c2" },
];

export const projects = [
  { id: "j1", name: "Atlas", status: "active", budget: 100, company: "c1", lead: "p01" },
  { id: "j2", name: "Borealis", status: "active", budget: 250, company: "c2", lead: "p03" },
  { id: "j3", name: "Cascade", status: "done", budget: 80, company: "c2", lead: "p09" },
  { id: "j4", name: "Delta", status: "planned", budget: 400, company: "c3", lead: null as string | null },
];
