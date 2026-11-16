// The world as an application graph (ADR-011, 2.4): the seed document the core loads once on first run, and the
// reads that bring tiles back out of it. Slice 0 reads every hex; later slices read only what is revealed.
import type { Client, GraphDocument, Properties } from "@relate/web";
import { neighbours, toAxial, type Tile, type Terrain, type Feature } from "../hex/core/index.js";
import { latticeAsset } from "../hex/assets/index.js";
import { START_MARKERS, START_STEPS } from "./world.js";

export const APPLICATION = { name: "phaser-path-explorer", version: 1 } as const;

export const hexId = (col: number, row: number) => `h:${col},${row}`;

/** The seed: a Hex node per tile, ADJ between neighbours (one direction per pair), a Player at the camp. */
export function worldDocument(rows: string[]): GraphDocument {
  const nodes: GraphDocument["nodes"] = [];
  const links: GraphDocument["links"] = [];
  const present = new Set<string>();
  rows.forEach((r, row) => {
    for (let col = 0; col < r.length; col++) if (r[col] !== " " && r[col] !== ".") present.add(`${col},${row}`);
  });
  let camp = "";
  const campNeighbours = new Set<string>();
  rows.forEach((r, row) => {
    for (let col = 0; col < r.length; col++) {
      if (r[col] === "t") {
        camp = `${col},${row}`;
        for (const [x, y] of neighbours(col, row)) campNeighbours.add(`${x},${y}`);
      }
    }
  });
  rows.forEach((r, row) => {
    for (let col = 0; col < r.length; col++) {
      const ch = r[col]!;
      if (!present.has(`${col},${row}`)) continue;
      const terrain = latticeAsset.terrainLegend[ch] ?? "grass";
      const feature = latticeAsset.featureLegend[ch];
      const key = `${col},${row}`;
      const isCamp = key === camp;
      const props: Properties = {
        col, row, ...toAxial(col, row), terrain,
        state: isCamp ? "path" : campNeighbours.has(key) ? "sensed" : "hidden",
      };
      if (feature) props["feature"] = feature;
      if (feature) props["anchor"] = true; // the camp and the towers are anchors
      if (isCamp) props["origin"] = true;
      nodes.push({ id: hexId(col, row), labels: ["Hex"], properties: props });
      // one direction per pair: link to the neighbours that come later in raster order
      for (const [x, y] of neighbours(col, row)) {
        if ((y > row || (y === row && x > col)) && present.has(`${x},${y}`))
          links.push({ source: hexId(col, row), target: hexId(x, y), type: "ADJ" });
      }
    }
  });
  nodes.push({ id: "player", labels: ["Player"], properties: { at: hexId(...(camp.split(",").map(Number) as [number, number])), steps: START_STEPS, markers: START_MARKERS } });
  return { version: 1, nodes, links };
}

/** Every hex as a tile, read back from the graph. */
export async function readTiles(client: Client): Promise<Tile[]> {
  const res = await client.query(
    "MATCH (h:Hex) RETURN h.col AS col, h.row AS row, h.terrain AS terrain, h.feature AS feature",
  );
  if (res.error) throw new Error(res.error);
  return res.rows.map((r) => {
    const tile: Tile = { col: r["col"] as number, row: r["row"] as number, terrain: r["terrain"] as Terrain };
    if (r["feature"]) tile.feature = r["feature"] as Feature;
    return tile;
  });
}
