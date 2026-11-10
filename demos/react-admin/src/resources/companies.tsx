import {
  Create,
  Datagrid,
  Edit,
  List,
  NumberField,
  NumberInput,
  SearchInput,
  SimpleForm,
  TextField,
  TextInput,
  required,
} from "react-admin";
import { CompanyShow } from "../CompanyPage.js";


const filters = [<SearchInput source="q" alwaysOn key="q" />, <TextInput source="industry" key="industry" />];

export const CompanyList = () => (
  <List filters={filters} sort={{ field: "name", order: "ASC" }} perPage={10}>
    <Datagrid rowClick="show" bulkActionButtons={false}>
      <TextField source="name" />
      <TextField source="industry" />
      <NumberField source="founded" options={{ useGrouping: false }} />
    </Datagrid>
  </List>
);

const CompanyForm = () => (
  <SimpleForm>
    <TextInput source="name" validate={required()} />
    <TextInput source="industry" />
    <NumberInput source="founded" />
  </SimpleForm>
);

export const CompanyEdit = () => (
  <Edit mutationMode="pessimistic">
    <CompanyForm />
  </Edit>
);
export const CompanyCreate = () => (
  <Create redirect="show">
    <CompanyForm />
  </Create>
);

export const companies = { list: CompanyList, edit: CompanyEdit, create: CompanyCreate, show: CompanyShow, recordRepresentation: "name" };
