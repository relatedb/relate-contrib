"use client";
import { useEffect, useState } from "react";
declare global { interface Window { __holders?: Record<string, number>; __log?: string[] } }
export function Holder({ name }: { name: string }) {
  const [id] = useState("x");
  useEffect(() => {
    const w = window; w.__holders ??= {}; w.__log ??= [];
    w.__holders[name] = (w.__holders[name] ?? 0) + 1; w.__log.push(`hold ${name}`);
    return () => { w.__holders![name]--; w.__log!.push(`release ${name}`); };
  }, [name]);
  return <p data-holder={name}>holder {name} {id}</p>;
}
