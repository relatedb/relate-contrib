// The world as an application graph (ADR-011, 2.4): the seed document the core loads once on first run, and the
// reads that bring tiles back out of it. Slice 0 reads every hex; later slices read only what is revealed.
import type { Client, GraphDocument, Properties } from "@relate/contrib-web";
import { neighbours, toAxial, type Tile, type Terrain, type Feature } from "../hex/core/index.js";
import { latticeAsset } from "../hex/assets/index.js";
import { SIGNPOST_REACH, START_MARKERS, START_STEPS, landDistances, terrainCost } from "./world.js";

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
  const campRing2 = new Set<string>();
  rows.forEach((r, row) => {
    for (let col = 0; col < r.length; col++) {
      if (r[col] === "t") {
        camp = `${col},${row}`;
        for (const [x, y] of neighbours(col, row)) {
          campNeighbours.add(`${x},${y}`);
          for (const [x2, y2] of neighbours(x, y)) campRing2.add(`${x2},${y2}`);
        }
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
        cost: terrainCost(ch), // steps to enter this hex; water costs more than any day
        // the camp stands in the open: the six hexes round it are in view, and the ring beyond is sensed
        state: isCamp ? "path" : campNeighbours.has(key) ? "viewed" : campRing2.has(key) ? "sensed" : "hidden",
      };
      if (feature) props["feature"] = feature;
      if (feature) props["anchor"] = true; // the camp and the towers are anchors
      if (feature === "tower") props["tower"] = true; // a settlement to save: the win and the score read these
      if (isCamp) {
        props["origin"] = true;
        props["mapped"] = true; // the camp starts with its signposts: the first direction to head in
      }
      nodes.push({ id: hexId(col, row), labels: ["Hex"], properties: props });
      // one direction per pair: link to the neighbours that come later in raster order
      for (const [x, y] of neighbours(col, row)) {
        if ((y > row || (y === row && x > col)) && present.has(`${x},${y}`))
          links.push({ source: hexId(col, row), target: hexId(x, y), type: "ADJ" });
      }
    }
  });
  // Signposts (ADR-011, amended): a settlement, and the camp, knows the settlements within a day's walk of it (by cost,
  // over land). A signpost shows only the direction of each one, once the explorer has arrived there.
  const towers: [number, number][] = [];
  rows.forEach((r, row) => [...r].forEach((ch, col) => (ch === "R" || ch === "U") && towers.push([col, row])));
  const [campCol, campRow] = camp.split(",").map(Number) as [number, number];
  const campHex = [campCol, campRow] as [number, number]; // the camp points the first way, over a day's walk; a settlement points only to the nearby ones
  for (const from of [campHex, ...towers]) {
    const dist = landDistances(rows, from);
    for (const to of towers) {
      if (to[0] === from[0] && to[1] === from[1]) continue;
      if ((dist.get(`${to[0]},${to[1]}`) ?? Infinity) <= (from === campHex ? START_STEPS : SIGNPOST_REACH))
        links.push({ source: hexId(from[0], from[1]), target: hexId(to[0], to[1]), type: "NEAR" });
    }
  }
  nodes.push({ id: "robot", labels: ["Robot"], properties: {} }); // the rogue AI, assembled a part a night
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
