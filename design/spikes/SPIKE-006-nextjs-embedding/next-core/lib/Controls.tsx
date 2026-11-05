"use client";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { getClient } from "./probe";

export function Controls() {
  const router = useRouter();
  const [inflight, setInflight] = useState("idle");
  return (
    <div>
      <button data-act="push" onClick={() => router.push("/a")}>push /a</button>
      <button data-act="replace" onClick={() => router.replace("/b")}>replace /b</button>
      <button data-act="back" onClick={() => router.back()}>back</button>
      <button
        data-act="inflight"
        onClick={() => {
          setInflight("running");
          getClient()
            .query("MATCH (a:Page), (b:Page) RETURN count(*) AS c", null, { timeoutMs: 60000 })
            .then((e) => setInflight(`done ${JSON.stringify((e as any).rows?.[0])}`))
            .catch((e) => setInflight(`error ${String(e?.reason ?? e)}`));
          router.push("/a");
        }}
      >
        query then push /a
      </button>
      <p>in flight: <b data-k="inflight">{inflight}</b></p>
    </div>
  );
}
