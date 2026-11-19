"use client";
// For the lifetime pages: a registered page-lifetime graph (`small`), with a log of what happened, kept in module state so
// it survives router navigations. The adapter's own tests read `window.__relLog`.
import { useGraph } from "@relate/contrib-nextjs/client";
import { visible } from "./visible";
import { useEffect } from "react";
import type { Client } from "@relate/contrib-web";

type Win = { __relLog?: string[]; __relClient?: Client };
const log: string[] = [];
if (typeof window !== "undefined") (window as unknown as Win).__relLog = log;
const ids = new WeakMap<Client, number>();
let made = 0;
const title = () => visible("[data-rel-title]")?.textContent ?? "?";

export function LifetimeProbe({ name = "small", label = "Item" }: { name?: string; label?: string }) {
  const client = useGraph(name);
  useEffect(() => {
    if (!client) return;
    const here = title();
    if (!ids.has(client)) {
      ids.set(client, ++made);
      log.push(`client:${ids.get(client)}:${here}`);
      const destroy = client.destroy.bind(client);
      client.destroy = () => {
        log.push(`destroy:${ids.get(client)}:${here}`);
        try {
          // a departure that ends the document leaves no log, so the record is kept where a reload can read it
          sessionStorage.setItem("rel-destroyed", [sessionStorage.getItem("rel-destroyed"), here].filter(Boolean).join("|"));
        } catch {
          /* storage may be unavailable */
        }
        destroy();
      };
    }
    log.push(`hold:${ids.get(client)}:${here}`);
    const status = visible("[data-life-status]");
    const count = visible("[data-life-count]");
    const restored = visible("[data-life-restored]");
    const offs = [
      client.on("status", ({ status: s }) => status && (status.textContent = s)),
      client.on("timing", ({ phase, restored: r }) => phase === "total" && restored && (restored.textContent = String(r))),
      client.subscribe(`MATCH (n:${label}) RETURN count(n) AS c`, null, (u) => u.rows && count && (count.textContent = String(u.rows[0]?.c))),
    ];
    (window as unknown as Win).__relClient = client;
    return () => {
      log.push(`release:${ids.get(client)}:${here}`);
      offs.forEach((off) => off());
    };
  }, [client, label]);
  return null;
}
