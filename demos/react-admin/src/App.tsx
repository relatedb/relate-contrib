import type { Client } from "@relate/web";
import { useEffect, useState } from "react";
import { Admin, Resource, type DataProvider } from "react-admin";
import { ClientContext } from "./ClientContext.js";
import { DemoLayout } from "./DemoLayout.js";
import { FailureScreen } from "./FailureScreen.js";
import { companies } from "./resources/companies.js";
import { people } from "./resources/people.js";
import { projects } from "./resources/projects.js";

/** The client's status, re-read when it changes. */
function useStatus(client: Client): Client["status"] {
  const [status, setStatus] = useState(client.status);
  useEffect(() => {
    setStatus(client.status);
    return client.on("status", (e) => setStatus(e.status));
  }, [client]);
  return status;
}

// The shell renders at once, before the client is ready: react-admin shows its loading state in the lists. A failed
// client shows the failure screen, never a blank page (constitution III, FR-034).
export function App({ client, dataProvider }: { client: Client; dataProvider: DataProvider }) {
  const status = useStatus(client);
  if (status === "failed") return <FailureScreen client={client} />;
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
