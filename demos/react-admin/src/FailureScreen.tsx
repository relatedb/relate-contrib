import { useState } from "react";
import type { Client } from "@relate/web";
import { failureInfo } from "./failures.js";
import { resetDemo } from "./reset.js";

type Phase = "idle" | "confirm" | "working" | "error";

/**
 * Shown instead of the app when the client has failed (FR-025): the reason, in plain words, and one choice, a confirmed
 * reset. There is no export here: the core's exportApplication() rejects once a client has failed.
 */
export function FailureScreen({ client }: { client: Client }) {
  const reason = client.diagnostic?.reason ?? "unknown";
  const info = failureInfo(reason);
  const [phase, setPhase] = useState<Phase>("idle");
  const [error, setError] = useState("");

  const reset = async () => {
    setPhase("working");
    try {
      await resetDemo(client);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setPhase("error");
    }
  };

  return (
    <main data-testid="failure" data-reason={reason} style={{ maxWidth: 640, margin: "48px auto", padding: "0 16px", fontFamily: "system-ui, sans-serif" }}>
      <h1 style={{ fontSize: 24 }}>Relate admin demo</h1>
      <h2 style={{ fontSize: 20 }}>{info.title}</h2>
      <p>{info.explanation}</p>
      {client.diagnostic?.engineError ? <p style={{ fontSize: 13, opacity: 0.75 }}>Details: {client.diagnostic.engineError}</p> : null}
      <p>{info.consequence}</p>
      {phase === "idle" || phase === "error" ? (
        <button type="button" onClick={() => setPhase("confirm")}>
          Reset demo data
        </button>
      ) : null}
      {phase === "confirm" ? (
        <p role="alertdialog" aria-label="Confirm reset">
          This cannot be undone.{" "}
          <button type="button" onClick={reset}>
            Confirm reset
          </button>{" "}
          <button type="button" onClick={() => setPhase("idle")}>
            Cancel
          </button>
        </p>
      ) : null}
      {phase === "working" ? <p role="status">Resetting…</p> : null}
      {phase === "error" ? <p role="alert">The reset did not finish: {error}</p> : null}
    </main>
  );
}
