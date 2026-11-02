import {useEffect, useState} from "react";
import {navigate} from "astro:transitions/client";
import {WorkerDb} from "../lib/worker/workerDb.js";
import {getClient, moduleId, state as moduleState} from "../lib/survival/client.js";
import {readConfig} from "../lib/survival/config.js";

type Props = {variant: "module" | "island" | "persist"; n: number};

const g = globalThis as any;
g.__surv ??= {log: [], navigate};
g.__surv.navigate = navigate;
const pageNumber = () => Number(location.pathname.match(/\/(\d+)\/?$/)?.[1] ?? 0);
const spawns = (db: any) => db.events.filter((e: any) => e[1].startsWith("spawn")).length;

function record(variant: string, db: any, extra: any = {}) {
  const entry = {
    variant, path: location.pathname, docId: g.__docId, moduleId,
    clientToken: db.token ?? null, workerId: db.workerId, generation: db.generation, spawns: spawns(db),
    subs: db.subs.size, moduleTicks: moduleState.ticks, moduleClientsCreated: moduleState.created,
    historyIndex: history.state?.index ?? null, ...extra
  };
  g.__surv.log.push(entry);
  g.__surv.last = entry;
  g.__surv.db = db;
  return entry;
}

export default function SurvivalPanel({variant, n}: Props) {
  const [text, setText] = useState("loading…");

  useEffect(() => {
    const {graph} = readConfig();
    let alive = true;
    let current = n;
    const db: any = variant === "island" || variant === "persist" ? new WorkerDb({graph}) : getClient(graph);
    if (!db.token) db.token = Math.random().toString(36).slice(2, 8);
    // Per-mount subscription: registered on every mount, so a leak would show as subs growing.
    let unsub = db.subscribe("MATCH (a:Page {id: $id})-[:LINKS_TO]->(b:Page) RETURN count(b) AS c", {id: current}, (e: any) => {
      if (alive && e.rows) setText(`page ${current}: ${e.rows[0].c} links · worker ${db.workerId} · generation ${e.generation}`);
    });
    const arrive = async () => {
      await db.ready;
      record(variant, db, {n: current});
    };
    arrive();

    // A persisted island is not remounted: it re-registers its own query on page load.
    const onPageLoad = () => {
      const page = pageNumber();
      if (variant !== "persist" || page === current) return;
      current = page;
      unsub();
      unsub = db.subscribe("MATCH (a:Page {id: $id})-[:LINKS_TO]->(b:Page) RETURN count(b) AS c", {id: current}, (e: any) => {
        if (alive && e.rows) setText(`page ${current}: ${e.rows[0].c} links · worker ${db.workerId} · generation ${e.generation}`);
      });
      arrive();
    };
    document.addEventListener("astro:page-load", onPageLoad);

    return () => {
      alive = false;
      document.removeEventListener("astro:page-load", onPageLoad);
      unsub();
      // The client owned by the island ends with it; the module client stays.
      if (variant === "island") db.destroy();
      g.__surv.unmounts = (g.__surv.unmounts ?? 0) + 1;
    };
  }, []);

  return <div data-status="panel" data-variant={variant}>{text}</div>;
}
