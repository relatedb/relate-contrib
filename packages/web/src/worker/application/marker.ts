// The marker: the one node that records an application store's format, schema version and state (ADR-009 2.2).
import { MARKER_FORMAT, MARKER_LABEL } from "../../config.js";
import type { Engine } from "../engine.js";
import { run } from "../loader.js";

export type MarkerState = "seeding" | "ready" | "importing";

export interface Marker {
  format: number;
  version: number;
  state: MarkerState | string;
}

/** Every marker in the store (there should be at most one). */
export function readMarkers(engine: Engine): Marker[] {
  return run(engine, `MATCH (m:${MARKER_LABEL}) RETURN m.format AS format, m.version AS version, m.state AS state`).rows.map((r) => ({
    format: r.format as number,
    version: r.version as number,
    state: r.state as string,
  }));
}

export function createMarker(engine: Engine, version: number, state: MarkerState): void {
  run(engine, `CREATE (:${MARKER_LABEL} {format: $format, version: $version, state: $state})`, { format: MARKER_FORMAT, version, state });
}

export function setState(engine: Engine, state: MarkerState): void {
  run(engine, `MATCH (m:${MARKER_LABEL}) SET m.state = $state`, { state });
}

export function setVersion(engine: Engine, version: number): void {
  run(engine, `MATCH (m:${MARKER_LABEL}) SET m.version = $version`, { version });
}
