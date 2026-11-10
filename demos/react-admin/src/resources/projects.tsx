import {
  Create,
  Datagrid,
  Edit,
  List,
  NumberField,
  NumberInput,
  ReferenceField,
  ReferenceInput,
  SearchInput,
  SelectInput,
  SimpleForm,
  TextField,
  TextInput,
  required,
} from "react-admin";

const STATUSES = ["planned", "active", "done"].map((id) => ({ id, name: id }));

const filters = [
  <SearchInput source="q" alwaysOn key="q" />,
  <SelectInput source="status" choices={STATUSES} key="status" />,
  <ReferenceInput source="company" reference="companies" key="company">
    <SelectInput optionText="name" />
  </ReferenceInput>,
];

export const ProjectList = () => (
  <List filters={filters} sort={{ field: "name", order: "ASC" }} perPage={10}>
    <Datagrid rowClick="edit" bulkActionButtons={false}>
      <TextField source="name" />
      <TextField source="status" />
      <NumberField source="budget" options={{ style: "currency", currency: "USD", maximumFractionDigits: 0 }} />
      <ReferenceField source="company" reference="companies" sortable={false} />
      <ReferenceField source="lead" reference="people" sortable={false} />
    </Datagrid>
  </List>
);

const ProjectForm = () => (
  <SimpleForm>
    <TextInput source="name" validate={required()} />
    <SelectInput source="status" choices={STATUSES} />
    <NumberInput source="budget" />
    <ReferenceInput source="company" reference="companies">
      <SelectInput optionText="name" />
    </ReferenceInput>
    <ReferenceInput source="lead" reference="people">
      <SelectInput optionText="name" />
    </ReferenceInput>
  </SimpleForm>
);

export const ProjectEdit = () => (
  <Edit mutationMode="pessimistic">
    <ProjectForm />
  </Edit>
);
export const ProjectCreate = () => (
  <Create redirect="list">
    <ProjectForm />
  </Create>
);

export const projects = { list: ProjectList, edit: ProjectEdit, create: ProjectCreate, recordRepresentation: "name" };
