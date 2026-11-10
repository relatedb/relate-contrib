import { useEffect, useState } from "react";
import type { Client } from "@relate/web";

/** Says where the visitor's records are kept, from the client's storage report (FR-024). */
export function StorageNotice({ client }: { client: Client }) {
  const [, tick] = useState(0);
  useEffect(() => {
    const offStorage = client.on("storage", () => tick((n) => n + 1));
    const offStatus = client.on("status", () => tick((n) => n + 1));
    return () => {
      offStorage();
      offStatus();
    };
  }, [client]);

  const { kind, reason } = client.storage;
  const text =
    kind === "durable"
      ? "Your records are stored in this browser and are still here after a reload."
      : kind === "waiting"
        ? reason === "locked"
          ? "Another tab of this app is using the data. This tab waits and continues when that tab closes."
          : "Opening the stored data…"
        : `Your records are held in memory only (${reason ?? "no browser storage"}) and are lost when the page closes.`;
  return (
    <div role="status" data-testid="storage-notice" data-kind={kind} style={{ margin: "8px 0", padding: "6px 10px", border: "1px solid #bbb", borderRadius: 4, fontSize: 13 }}>
      {text}
    </div>
  );
}
