import { useEffect, useState } from "react";
import type { Client } from "@relate/contrib-web";

/**
 * Says where the visitor's records are kept, from the client's storage report (FR-024), and offers to ask the browser to
 * keep them. The request is made only when the visitor presses the button, never on its own.
 */
export function StorageNotice({ client }: { client: Client }) {
  const [, tick] = useState(0);
  const [asked, setAsked] = useState<"no" | "asking" | "granted" | "refused">("no");
  useEffect(() => {
    const offStorage = client.on("storage", () => tick((n) => n + 1));
    const offStatus = client.on("status", () => tick((n) => n + 1));
    return () => {
      offStorage();
      offStatus();
    };
  }, [client]);

  const { kind, reason, persisted } = client.storage;
  const text =
    kind === "durable"
      ? "Your records are stored in this browser and are still here after a reload."
      : kind === "waiting"
        ? reason === "locked"
          ? "Another tab of this app is using the data. This tab waits and continues when that tab closes."
          : "Opening the stored data…"
        : `Your records are held in memory only (${reason ?? "no browser storage"}) and are lost when the page closes.`;

  // the promise can stay pending (Firefox waits on a permission prompt), so the notice follows the storage report as well
  const ask = () => {
    setAsked("asking");
    client.requestPersistence().then(
      (granted) => setAsked(granted ? "granted" : "refused"),
      () => setAsked("refused"),
    );
  };
  const persistedNow = persisted === true || asked === "granted";

  return (
    <div role="status" data-testid="storage-notice" data-kind={kind} data-reason={reason ?? ""} style={{ margin: "8px 0", padding: "6px 10px", border: "1px solid #bbb", borderRadius: 4, fontSize: 13 }}>
      <span>{text}</span>
      {kind === "durable" ? (
        <>
          {" "}
          {persistedNow ? (
            <span data-testid="persistence">The browser has agreed to keep this data.</span>
          ) : asked === "asking" ? (
            <span data-testid="persistence">Asking the browser…</span>
          ) : (
            <>
              {asked === "refused" ? <span data-testid="persistence">The browser did not agree; it may remove the data if space runs low. </span> : null}
              <button type="button" onClick={ask}>
                Ask the browser to keep my data
              </button>
            </>
          )}
        </>
      ) : null}
    </div>
  );
}
