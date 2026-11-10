// The flat and facet looks: smooth vector terrain on the same lattice as the pixel look, a port of the design
// system's `facet` builder. A tile is a base colour (the flat look is this alone) and a list of polygons
// (the facet look adds them). Every random draw happens in the same order as the original.
import { rng } from "./rng.js";
import type { Feature, Terrain } from "./paint.js";

export interface Poly {
  /** Palette colour name. */
  colour: string;
  /** x, y, x, y ... in lattice cells, relative to the tile's top-left. */
  points: number[];
}

export interface FacetTile {
  base: string;
  polys: Poly[];
}

/** The hexagon's outline, as the design system draws it, in lattice cells. */
export const HEX_OUTLINE: number[] = [8, 0, 16, 3, 16, 14, 8, 17, 0, 14, 0, 3];

const tri = (x: number, y: number, w: number, hh: number) => [x, y + hh, x + w / 2, y, x + w, y + hh];
const lhalf = (x: number, y: number, w: number, hh: number) => [x, y + hh, x + w / 2, y, x + w / 2, y + hh];
const rhalf = (x: number, y: number, w: number, hh: number) => [x + w / 2, y + hh, x + w / 2, y, x + w, y + hh];
const chev = (x: number, y: number) => [x, y, x + 2, y + 1.6, x + 4, y, x + 4, y + 1, x + 2, y + 2.6, x, y + 1];
const rect = (x: number, y: number, w: number, hh: number) => [x, y, x + w, y, x + w, y + hh, x, y + hh];

const BASE: Partial<Record<Terrain, string>> = {
  water: "mid-baltic",
  deep: "dark-baltic",
  sand: "cream",
  badlands: "light-hibiscus",
  hills: "light-forest",
};

export function facetTile(terrain: Terrain, seed: number, feature?: Feature): FacetTile {
  const R = rng(seed);
  const rnd = (n: number) => Math.floor(R() * n);
  const polys: Poly[] = [];
  const P = (colour: string, points: number[]) => polys.push({ colour, points });
  const base = BASE[terrain] ?? "mid-forest";

  if (terrain === "water" || terrain === "deep") {
    for (let i = 0; i < 3; i++)
      P(terrain === "deep" ? "mid-baltic" : i % 2 ? "light-baltic" : "baltic", chev(3 + rnd(7) + (i % 2) * 0.5, 3.6 + i * 3.6));
  } else if (terrain === "sand") {
    for (const q of [[3, 4], [8, 7.5], [3.5, 11]] as const) {
      const x = q[0] + rnd(3) * 0.5;
      const y = q[1];
      P("light-hibiscus", lhalf(x, y, 6, 2.6));
      P("mid-hibiscus", rhalf(x, y, 6, 2.6));
    }
  } else if (terrain === "badlands") {
    P("mid-hibiscus", [3, 9, 4.5, 5.5, 10, 5.5, 11.5, 9]);
    P("hibiscus", rect(3, 9, 8.5, 1.4));
    P("mid-hibiscus", [9.5, 13, 10.5, 11, 13, 11, 13.5, 13]);
  } else if (terrain === "hills") {
    for (const q of ([[2, 7], [8.5, 5], [6, 10.5]] as const).slice(0, 2 + rnd(2))) {
      P("mid-forest", lhalf(q[0], q[1], 6.5, 3.2));
      P("forest", rhalf(q[0], q[1], 6.5, 3.2));
    }
  } else if (terrain === "forest") {
    for (const q of ([[3, 4], [8.5, 4.5], [5.5, 9], [9.5, 9.5]] as const).slice(0, 3 + rnd(2))) {
      const x = q[0] + rnd(2) * 0.5;
      const y = q[1];
      P("light-forest", lhalf(x, y, 4.4, 4.6));
      P("forest", rhalf(x, y, 4.4, 4.6));
    }
  } else if (terrain === "mountain") {
    P("light-gray", lhalf(3, 3, 10, 8.6));
    P("dark-gray", rhalf(3, 3, 10, 8.6));
    P("cream", [8, 3, 9.9, 6.3, 9, 5.6, 8, 6.6, 7, 5.6, 6.1, 6.3]);
    P("light-gray", lhalf(10.8, 8, 4.6, 3.6));
    P("dark-gray", rhalf(10.8, 8, 4.6, 3.6));
  } else {
    for (let i = 0; i < 4; i++) {
      const x = 3 + rnd(9);
      const y = 4 + rnd(8);
      P("forest", tri(x, y, 2, 2));
    }
  }

  if (feature === "town") {
    P("cream", rect(3, 9.5, 4.6, 3.8));
    P("hibiscus", tri(2.4, 6.6, 5.8, 2.9));
    P("cream", rect(8.6, 10.5, 4, 3));
    P("mid-hibiscus", tri(8, 8, 5.2, 2.5));
    P("black", rect(5, 3.6, 0.5, 3));
    P("yellow", [5.5, 3.6, 7.6, 4.4, 5.5, 5.2]);
    P("dark-baltic", rect(4.6, 11, 1.2, 2.3));
  } else if (feature === "tent") {
    P("hibiscus", lhalf(3, 5.5, 10, 6.8));
    P("mid-hibiscus", rhalf(3, 5.5, 10, 6.8));
    P("dark-baltic", tri(6.4, 8.6, 3.2, 3.7));
  } else if (feature === "tower") {
    P("cream", [5.5, 13.6, 5.5, 5.6, 6.8, 5.6, 6.8, 6.7, 7.4, 6.7, 7.4, 5.6, 8.6, 5.6, 8.6, 6.7, 9.2, 6.7, 9.2, 5.6, 10.5, 5.6, 10.5, 13.6]);
    P("dark-baltic", rect(7.2, 10.6, 1.6, 3));
    P("black", rect(7.75, 2.2, 0.5, 3.5));
    P("yellow", [8.25, 2.2, 10.4, 3, 8.25, 3.8]);
  }
  return { base, polys };
}
