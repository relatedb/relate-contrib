import {useEffect, useState} from "react";
import {acquire} from "../lib/lifetime/host.js";
import {readConfig} from "../lib/lifetime/config.js";
import {record} from "../lib/lifetime/log.js";
import {navStart} from "../lib/lifetime/nav-clock.js";
import {overlayAdd, overlayDrop} from "../lib/lifetime/overlay.js";

type Props = {mode: string; n: number; variant?: string};
type State = {status: "loading" | "ready" | "failed"; count?: number; notes?: number; instanceId?: string; reused?: boolean; error?: string};

const SHARED = new Set(["singleton", "persist", "naive", "dedicated", "worker", "worker-router"]);
const hostMode = (mode: string) => (mode.startsWith("worker") ? "worker" : mode === "dedicated" ? "dedicated" : ["persist", "singleton", "naive"].includes(mode) ? "singleton" : "instance");
const pageNumber = () => Number(location.pathname.match(/\/(\d+)\/?$/)?.[1] ?? 1);

// The "naive" variant reads the instance's answer during render when one is
// already available. That is the mistake a component makes if it assumes the
// server and the first browser render see the same state.
const readyNow = () => (globalThis as any).__lifetimeReady as {count: number} | undefined;

export default function GraphPanel({mode, n, variant = "safe"}: Props) {
  const early = variant === "naive" ? readyNow()?.count : undefined;
  const [state, setState] = useState<State>(early === undefined ? {status: "loading"} : {status: "ready", count: early});

  useEffect(() => {
    let current = n;
    let host: any = null;
    let leaving = false;

    const arrive = async (page: number) => {
      const started = navStart();
      const config = readConfig();
      setState({status: "loading"});
      const a0 = performance.now();
      try {
        host = await acquire(hostMode(mode), config);
        const acquireMs = performance.now() - a0;
        const q0 = performance.now();
        const result = await host.query("MATCH (a:Page {id: $id})-[:LINKS_TO]->(b:Page) RETURN count(b) AS c", {id: page});
        const count = result.rows[0].c;
        const queryMs = performance.now() - q0;
        let notes: number | undefined;
        if (SHARED.has(mode)) notes = await overlayAdd(host, page, host.totalPages);
        (globalThis as any).__lifetimeReady = {count};
        setState({status: "ready", count, notes, instanceId: host.instanceId, reused: host.reused});
        record({
          mode, n: page, nav: started > 0 ? "swap" : "load", ok: true,
          instanceId: host.instanceId, kind: host.kind, reused: host.reused,
          initMs: host.timings?.initMs, replayMs: host.timings?.loadMs,
          acquireMs: Math.round(acquireMs * 10) / 10, queryMs: Math.round(queryMs * 10) / 10,
          readyMs: Math.round((performance.now() - started) * 10) / 10, notes, connections: host.connections
        });
      } catch (e) {
        setState({status: "failed", error: String((e as Error)?.message ?? e)});
        record({mode, n: page, nav: started > 0 ? "swap" : "load", ok: false, error: String((e as Error)?.message ?? e).slice(0, 120)});
      }
    };

    const depart = async () => {
      if (leaving || !host) return;
      leaving = true;
      try {
        if (SHARED.has(mode)) await overlayDrop(host, current);
      } finally {
        host.release();
        host = null;
      }
    };

    arrive(current);

    // A persisted island is not remounted by the router: it has to notice the
    // new page itself.
    const onPageLoad = async () => {
      const page = pageNumber();
      if (mode !== "persist" || page === current) return;
      if (host && SHARED.has(mode)) await overlayDrop(host, current);
      current = page;
      arrive(page);
    };
    document.addEventListener("astro:page-load", onPageLoad);
    const onHide = () => {
      void depart();
    };
    window.addEventListener("pagehide", onHide);

    return () => {
      document.removeEventListener("astro:page-load", onPageLoad);
      window.removeEventListener("pagehide", onHide);
      void depart();
    };
  }, []);

  return (
    <div data-status={state.status} data-mode={mode}>
      {state.status === "loading" && <span>Loading graph…</span>}
      {state.status === "failed" && <span className="error">Graph unavailable: {state.error}</span>}
      {state.status === "ready" && (
        <span>
          Page links to {state.count} pages · instance {state.instanceId ?? "?"}
          {state.reused ? " (reused)" : " (new)"} · overlay notes {state.notes ?? "n/a"}
        </span>
      )}
    </div>
  );
}
