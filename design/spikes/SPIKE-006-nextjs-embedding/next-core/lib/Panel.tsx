"use client";
import { useEffect, useState } from "react";
import { getClient, moduleId, spawnCount } from "./probe";

export function Panel({ where }: { where: string }) {
  const [state, setState] = useState({ status: "—", generation: -1, count: "…", spawns: 0 });
  const [id, setId] = useState("…");
  useEffect(() => {
    const c = getClient();
    setId(moduleId);
    const refresh = (count?: string) =>
      setState((s) => ({ status: c.status, generation: c.generation, count: count ?? s.count, spawns: spawnCount() }));
    refresh();
    const offs = [
      c.on("status", () => refresh()),
      c.subscribe("MATCH (n:Page) RETURN count(n) AS c", null, (u) => u.rows && refresh(String((u.rows[0] as any)?.c ?? (u.rows[0] as any)?.[0]))),
    ];
    return () => offs.forEach((off) => off());
  }, []);
  return (
    <section data-where={where}>
      <p>where: <b data-k="where">{where}</b></p>
      <p>module: <b data-k="module">{id}</b> · spawns: <b data-k="spawns">{state.spawns}</b></p>
      <p>status: <b data-k="status">{state.status}</b> · generation: <b data-k="generation">{state.generation}</b> · pages: <b data-k="count">{state.count}</b></p>
    </section>
  );
}
