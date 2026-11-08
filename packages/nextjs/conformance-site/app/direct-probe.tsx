"use client";
// Code that asks for a visit-lifetime graph directly, outside any hook, twice, after the provider has mounted.
import { graph } from "@relate/nextjs/client";
import { visible } from "./visible";
import { useEffect } from "react";

export function DirectProbe() {
  useEffect(() => {
    // the provider's effect runs after its children's, so the lookup waits one task
    const timer = setTimeout(() => {
      const first = graph("example");
      const second = graph("example");
      (window as unknown as { __relDirect: unknown }).__relDirect = { same: first === second, client: first };
      first.subscribe("MATCH (n:Page) RETURN count(n) AS c", null, (u) => {
        if (u.rows) visible("[data-direct-count]")!.textContent = String(u.rows[0]?.c);
      });
      // a page-lifetime graph, an inline graph and an unknown graph must fail loudly
      const errors: string[] = [];
      for (const name of ["small", "notebook", "nope"]) {
        try {
          graph(name);
        } catch (e) {
          errors.push((e as Error).message);
        }
      }
      visible("[data-direct-errors]")!.textContent = JSON.stringify(errors);
    }, 0);
    return () => clearTimeout(timer);
  }, []);
  return null;
}
