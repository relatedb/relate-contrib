import { Datagrid, EditButton, NumberField, ReferenceField, ReferenceManyField, Show, SimpleShowLayout, TextField } from "react-admin";

/**
 * A company with the people who work there and the projects it owns. Both lists come from `getManyReference`: the
 * provider reads the people and projects whose `company` reference is this company (FR-022).
 */
export const CompanyShow = () => (
  <Show>
    <SimpleShowLayout>
      <TextField source="name" />
      <TextField source="industry" />
      <NumberField source="founded" options={{ useGrouping: false }} />
      <ReferenceManyField label="People" reference="people" target="company" sort={{ field: "name", order: "ASC" }}>
        <Datagrid bulkActionButtons={false} rowClick="edit">
          <TextField source="name" />
          <TextField source="title" sortable={false} />
          <NumberField source="age" />
        </Datagrid>
      </ReferenceManyField>
      <ReferenceManyField label="Projects" reference="projects" target="company" sort={{ field: "name", order: "ASC" }}>
        <Datagrid bulkActionButtons={false} rowClick="edit">
          <TextField source="name" />
          <TextField source="status" />
          <NumberField source="budget" options={{ style: "currency", currency: "USD", maximumFractionDigits: 0 }} />
          <ReferenceField source="lead" reference="people" sortable={false} />
          <EditButton />
        </Datagrid>
      </ReferenceManyField>
    </SimpleShowLayout>
  </Show>
);
