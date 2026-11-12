import {
  BooleanField,
  BooleanInput,
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

// the filters use the provider's conventions: q searches, a reference filters by target id, and age_gte is a comparison
const filters = [
  <SearchInput source="q" alwaysOn key="q" />,
  <ReferenceInput source="company" reference="companies" key="company">
    <SelectInput optionText="name" />
  </ReferenceInput>,
  <BooleanInput source="active" key="active" />,
  <NumberInput source="age_gte" label="Minimum age" key="age_gte" />,
];

export const PersonList = () => (
  <List filters={filters} sort={{ field: "name", order: "ASC" }} perPage={10}>
    <Datagrid rowClick="edit" bulkActionButtons={false}>
      <TextField source="name" />
      <TextField source="title" sortable={false} />
      <NumberField source="age" />
      <BooleanField source="active" sortable={false} />
      <ReferenceField source="company" reference="companies" sortable={false} />
    </Datagrid>
  </List>
);

const PersonForm = () => (
  <SimpleForm>
    <TextInput source="name" validate={required()} />
    <TextInput source="title" />
    <NumberInput source="age" />
    <BooleanInput source="active" />
    <ReferenceInput source="company" reference="companies">
      <SelectInput optionText="name" />
    </ReferenceInput>
  </SimpleForm>
);

export const PersonEdit = () => (
  <Edit mutationMode="pessimistic">
    <PersonForm />
  </Edit>
);
export const PersonCreate = () => (
  <Create redirect="list">
    <PersonForm />
  </Create>
);

export const people = { list: PersonList, edit: PersonEdit, create: PersonCreate, recordRepresentation: "name" };
