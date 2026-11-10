import { useState } from "react";
import { useNotify, useRefresh } from "react-admin";
import { useClient } from "./ClientContext.js";
import { resetDemo, saveJson } from "./reset.js";

type Phase = "closed" | "open" | "confirm" | "working";

/**
 * Reset demo data (FR-023): it offers a copy of the records first, then, after a confirmation, discards them and loads
 * the demo data again. The copy is the core's export; this demo's records use only strings, numbers and booleans, so
 * the export carries them without loss and needs no allowLoss.
 */
export function ResetControl() {
  const client = useClient();
  const refresh = useRefresh();
  const notify = useNotify();
  const [phase, setPhase] = useState<Phase>("closed");
  const [saved, setSaved] = useState("");

  const download = async () => {
    try {
      const { envelope } = await client.exportApplication();
      saveJson("react-admin-demo-export.json", envelope);
      setSaved(`Saved ${envelope.document.nodes.length} records to react-admin-demo-export.json.`);
    } catch (e) {
      setSaved(`The copy could not be made: ${e instanceof Error ? e.message : String(e)}`);
    }
  };

  const reset = async () => {
    setPhase("working");
    try {
      await resetDemo(client);
      notify("Demo data reset", { type: "info" });
      refresh();
    } catch (e) {
      notify(`The reset did not finish: ${e instanceof Error ? e.message : String(e)}`, { type: "error" });
    }
    setPhase("closed");
    setSaved("");
  };

  return (
    <div data-testid="reset-control" style={{ margin: "8px 0", fontSize: 13 }}>
      {phase === "closed" ? (
        <button type="button" onClick={() => setPhase("open")}>
          Reset demo data
        </button>
      ) : (
        <div style={{ border: "1px solid #bbb", borderRadius: 4, padding: "8px 10px" }}>
          <p style={{ margin: "0 0 8px" }}>This discards every record you added or changed and loads the demo data again.</p>
          <button type="button" onClick={download} disabled={phase === "working"}>
            Download a copy
          </button>{" "}
          {phase === "open" ? (
            <button type="button" onClick={() => setPhase("confirm")}>
              Discard and reset
            </button>
          ) : null}
          {phase === "confirm" ? (
            <>
              <button type="button" onClick={reset}>
                Confirm reset
              </button>{" "}
            </>
          ) : null}
          <button type="button" onClick={() => setPhase("closed")} disabled={phase === "working"}>
            Cancel
          </button>
          {saved ? (
            <p role="status" style={{ margin: "8px 0 0" }}>
              {saved}
            </p>
          ) : null}
        </div>
      )}
    </div>
  );
}
