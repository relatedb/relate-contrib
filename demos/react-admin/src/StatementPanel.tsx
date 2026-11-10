import { useSyncExternalStore } from "react";
import { snapshot, subscribe } from "./statementLog.js";

/** The statements the provider ran, newest first: what a list, a filter or an edit turned into (FR-022). */
export function StatementPanel() {
  const entries = useSyncExternalStore(subscribe, snapshot);
  return (
    <details style={{ margin: "16px 0", fontSize: 13 }} data-testid="statements">
      <summary style={{ cursor: "pointer" }}>
        Statements run ({entries.length} most recent) <span style={{ opacity: 0.7 }}>what the provider sent to the embedded graph</span>
      </summary>
      <ol reversed style={{ paddingLeft: 24, maxHeight: 320, overflow: "auto" }}>
        {entries.map((e) => (
          <li key={e.n} style={{ marginBottom: 10 }}>
            <pre style={{ margin: 0, whiteSpace: "pre-wrap", fontSize: 12 }}>{e.statement}</pre>
            <code style={{ opacity: 0.7, fontSize: 12 }}>{JSON.stringify(e.params)}</code>
          </li>
        ))}
      </ol>
    </details>
  );
}
