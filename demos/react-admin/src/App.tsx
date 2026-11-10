import type { Client } from "@relate/web";
import { Admin, Resource, type DataProvider } from "react-admin";
import { ClientContext } from "./ClientContext.js";
import { DemoLayout } from "./DemoLayout.js";
import { companies } from "./resources/companies.js";
import { people } from "./resources/people.js";
import { projects } from "./resources/projects.js";

export function App({ client, dataProvider }: { client: Client; dataProvider: DataProvider }) {
  return (
    <ClientContext.Provider value={client}>
      <Admin dataProvider={dataProvider} layout={DemoLayout} title="Relate admin demo" disableTelemetry>
        <Resource name="people" {...people} />
        <Resource name="companies" {...companies} />
        <Resource name="projects" {...projects} />
      </Admin>
    </ClientContext.Provider>
  );
}
