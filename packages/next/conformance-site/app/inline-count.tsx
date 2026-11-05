"use client";
// For the pages that carry inline graphs: asks for the graph, counts its nodes and shows the count in the page's static
// markup. The clients are exposed for the adapter's own tests (`window.__gwClients`).
import { useGraph } from "@relate/web-next/client";
import { visible } from "./visible";
import { useEffect } from "react";
import type { Client } from "related-web-core";

type Win = { __gwClients?: Record<string, Client> };

export function InlineCount({ name }: { name: string }) {
  const client = useGraph(name);
  useEffect(() => {
    if (!client) return;
    const win = window as unknown as Win;
    (win.__gwClients ??= {})[name] = client;
    const show = (text: string): void => {
      const target = visible(`[data-inline-count="${name}"]`);
      if (target) target.textContent = text;
      const gen = visible(`[data-inline-generation="${name}"]`);
      if (gen) gen.textContent = String(client.generation);
    };
    const offs = [client.on("status", () => show("…")), client.subscribe("MATCH (n) RETURN count(n) AS c", null, (u) => u.rows && show(String(u.rows[0]?.c)))];
    return () => {
      offs.forEach((off) => off());
      if (win.__gwClients?.[name] === client) delete win.__gwClients[name];
    };
  }, [client, name]);
  return null;
}
