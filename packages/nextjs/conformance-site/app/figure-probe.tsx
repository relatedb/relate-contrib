"use client";
// Shows how long the core says a graph took to load, for the load-figure pages (single measurements).
import { useGraph } from "@relate/contrib-nextjs/client";
import { useEffect } from "react";
import { visible } from "./visible";

export function FigureProbe({ name }: { name: string }) {
  const client = useGraph(name);
  useEffect(() => {
    if (!client) return;
    return client.on("timing", ({ phase, ms }) => {
      if (phase === "total") visible("[data-figure-total]")!.textContent = String(Math.round(ms));
    });
  }, [client]);
  return null;
}
