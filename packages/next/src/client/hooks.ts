"use client";
// The hooks (spec FR-017, FR-023 to FR-025). Both return the same empty values on the server and on the first client
// render, so the markup matches; the client is asked for in an effect.
import { useContext, useEffect, useState } from "react";
import type { Client, Status } from "@relate/web-core";
import { ConfigContext } from "./Provider.js";
import { hold } from "./registry.js";
import type { GraphOptions } from "./registry.js";

export function useGraph(id: string, options?: GraphOptions): Client | null {
  const config = useContext(ConfigContext);
  const [client, setClient] = useState<Client | null>(null);
  const navigation = options?.navigation;
  const descriptor = options?.descriptor;
  useEffect(() => {
    if (!config) throw new Error(`@relate/web-next: useGraph("${id}") was used outside RelatedWebProvider`);
    const held = hold(config, id, { navigation, descriptor });
    setClient(held.client);
    return () => {
      held.release();
      setClient(null);
    };
  }, [config, id, navigation, descriptor]);
  return client;
}

export interface QueryResult {
  /** `"idle"` until the client answers; then the core's status. */
  status: Status | "idle";
  rows: Array<Record<string, unknown>> | null;
  error: string | null;
}

const IDLE: QueryResult = { status: "idle", rows: null, error: null };

export function useQuery(id: string, statement: string, params?: object | null, options?: GraphOptions): QueryResult {
  const client = useGraph(id, options);
  const [result, setResult] = useState<QueryResult>(IDLE);
  const key = JSON.stringify(params ?? null);
  useEffect(() => {
    if (!client) return;
    const off = client.subscribe(statement, params ?? null, (u) => setResult({ status: u.status, rows: u.rows, error: u.error }));
    return () => {
      off();
      setResult(IDLE);
    };
    // `params` is compared by its JSON text, so a new object with the same content does not resubscribe.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [client, statement, key]);
  return result;
}
