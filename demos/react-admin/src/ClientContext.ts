import { createContext, useContext } from "react";
import type { Client } from "@relate/web";

export const ClientContext = createContext<Client | null>(null);

export function useClient(): Client {
  const client = useContext(ClientContext);
  if (!client) throw new Error("no client in context");
  return client;
}
