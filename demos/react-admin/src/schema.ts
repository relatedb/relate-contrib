// The demo's schema: three resources linked by relationships (data-model.md "Demo data" in specs/008-react-admin-provider).
import type { Schema } from "@relate/react-admin";

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
