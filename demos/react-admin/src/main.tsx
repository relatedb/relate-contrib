import { createClient } from "@relate/contrib-web";
import { createDataProvider } from "@relate/contrib-react-admin";
import engineUrl from "@relate/relate-wasm/relate_bg.wasm?url";
import workerUrl from "@relate/contrib-web/worker?worker&url";
import { createRoot } from "react-dom/client";
import { App } from "./App.js";
import { schema } from "./schema.js";
import seed from "./seed.json";
import { record } from "./statementLog.js";

/** The store the visitor's records live in. A project that copies the demo renames it: two applications on one origin that share a name share a store. */
export const STORE_NAME = "react-admin-demo";

// The application graph: durable, seeded once from seed.json and never over stored data (ADR-009). The engine binary and
// the worker are placed by the bundler and passed by URL.
const client = createClient({
  engineUrl,
  navigation: "client-routing",
  workerFactory: () => new Worker(workerUrl, { type: "module" }),
  application: { name: STORE_NAME, version: 1, seed: seed as never },
});

// The provider makes the uniqueness constraints on id itself, before its first statement.
const dataProvider = createDataProvider(client, schema, { onStatement: record });

createRoot(document.getElementById("root")!).render(<App client={client} dataProvider={dataProvider} />);
