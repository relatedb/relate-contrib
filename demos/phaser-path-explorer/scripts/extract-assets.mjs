#!/usr/bin/env node
// Extracts the hex library's assets and its golden fixtures from the "Relate by ABK" design system (ADR-011, 2.2).
//
//   node scripts/extract-assets.mjs --bundle <bundle.js> --tokens <tokens.json> --version <artifact version>
//
// Data (palette, sprites, feature bitmaps, lattice, legend) is copied into src/hex/assets/*.json.
// The bundle's own HexMap is then run in a sandbox, with a recording stand-in for React, to produce golden
// fixtures: the cells it paints for fixed maps. The core's painters are tested against those fixtures, so a
// drift from the design system is caught by a check. Rerun after the design system changes.
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import vm from "node:vm";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");

function arg(name) {
  const i = process.argv.indexOf(`--${name}`);
  if (i < 0 || !process.argv[i + 1]) {
    console.error(`missing --${name}`);
    process.exit(2);
  }
  return process.argv[i + 1];
}

const bundlePath = arg("bundle");
const tokensPath = arg("tokens");
const sourceVersion = arg("version");

// The bundle is a classic script wrapped in an IIFE that assigns window.Relate (only the React components are
// exported). To reach the data tables and the terrain painter, a line exposing them is spliced in before the
// wrapper closes. This happens in a sandbox and the bundle itself is not changed.
const source = readFileSync(bundlePath, "utf8");
const close = source.lastIndexOf("})();");
if (close < 0) throw new Error("bundle.js is not wrapped in an IIFE as expected");
const exposed = source.slice(0, close) +
  "window.__internals={hexPaint:hexPaint,BM:BM,BC:BC,SPRITES:SPRITES,SPR_PAL:SPR_PAL,HX:HX,TL:TL,TF:TF,NODE_TONES:NODE_TONES,arrowGeometry:arrowGeometry};\n" +
  source.slice(close);
const sandbox = {
  window: { React: { createElement: (type, props, ...children) => ({ type, props, children }) } },
};
vm.runInContext(exposed, vm.createContext(sandbox), { filename: "bundle.js" });
const ctx = {
  ...sandbox.window.__internals,
  HexMap: sandbox.window.Relate.HexMap,
  HexField: sandbox.window.Relate.HexField,
  Sprite: sandbox.window.Relate.Sprite,
  HexGraph: sandbox.window.Relate.HexGraph,
  Arrow: sandbox.window.Relate.Arrow,
  HexElbow: sandbox.window.Relate.HexElbow,
  HexCross: sandbox.window.Relate.HexCross,
};

const out = (name, value) => {
  const path = resolve(root, name);
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, JSON.stringify(value, null, 1) + "\n");
  console.log("wrote", name);
};
const header = { generatedBy: "scripts/extract-assets.mjs", source: "Relate by ABK design system", sourceVersion };

// --- data ---
const tokens = JSON.parse(readFileSync(tokensPath, "utf8"));
const palette = {};
for (const t of tokens.color.tokens) {
  if (t.name.startsWith("neo-")) palette[t.name.slice(4)] = t.value;
}
out("src/hex/assets/palette.json", { ...header, colours: palette });
out("src/hex/assets/sprites.json", { ...header, palette: ctx.SPR_PAL, sprites: ctx.SPRITES });
out("src/hex/assets/node-tones.json", { ...header, tones: ctx.NODE_TONES });
out("src/hex/assets/features.json", { ...header, bitmaps: ctx.BM, colours: ctx.BC });
out("src/hex/assets/lattice.json", {
  ...header,
  tileWidth: ctx.HX.W,
  tileHeight: ctx.HX.H,
  rowStep: ctx.HX.P,
  oddRowShift: 8,
  seed: { col: 7919, row: 104729, add: 13 },
  terrainLegend: ctx.TL,
  featureLegend: ctx.TF,
});

// --- golden fixtures: what the bundle's own HexMap paints ---
function runHexMap(props) {
  const root = ctx.HexMap({ ...props, pixel: 1 });
  const paths = root.children[0];
  const colours = {};
  for (const p of paths) {
    const colour = p.props.style.fill.replace(/^var\(--neo-/, "").replace(/\)$/, "");
    const cells = [];
    // each run is "M x y h n v1 h-n z"
    for (const m of p.props.d.matchAll(/M(-?\d+) (-?\d+)h(\d+)v1h-\d+z/g)) {
      const [x, y, n] = [Number(m[1]), Number(m[2]), Number(m[3])];
      for (let k = 0; k < n; k++) cells.push(`${x + k},${y}`);
    }
    colours[colour] = cells.sort();
  }
  return { w: root.props.width, h: root.props.height, colours };
}

const cases = [
  {
    name: "every-legend-character",
    input: { rows: ["DDwwwsss", "wwsggfhm", "sggfhmbb", "ggTfRhUb", ".tgfhmbm"] },
  },
  {
    name: "explicit-tiles-and-seeds",
    input: {
      tiles: [
        { col: 0, row: 0, terrain: "grass", seed: 1 },
        { col: 1, row: 0, terrain: "grass", seed: 2 },
        { col: 0, row: 1, terrain: "forest", feature: "town", seed: 99 },
        { col: 3, row: 2, terrain: "hills", feature: "tower" },
        { col: 5, row: 3, terrain: "mountain", feature: "tent", seed: 7 },
      ],
    },
  },
];
out("tests/fixtures/hexmap-golden.json", {
  ...header,
  cases: cases.map((c) => ({ ...c, expected: runHexMap(c.input) })),
});

// --- golden fixtures for the flat and facet looks (HexField) and for sprites ---
function runHexField(props) {
  const root = ctx.HexField({ ...props, pixel: 1 });
  const tiles = [];
  for (const g of root.children[0]) {
    if (!g.props || g.props.className !== "rl-hex") continue; // edge paths are not tiles
    const polys = g.children[0].map((poly) => ({
      fill: poly.props.style.fill.replace(/^var\(--neo-/, "").replace(/\)$/, ""),
      points: poly.props.points,
    }));
    tiles.push({ col: g.props["data-col"], row: g.props["data-row"], terrain: g.props["data-terrain"], polys });
  }
  return tiles;
}
const fieldCases = [
  { name: "facet-every-legend-character", input: { rows: ["DDwwwsss", "wwsggfhm", "sggfhmbb", "ggTfRhUb", ".tgfhmbm"], look: "facet" } },
  { name: "flat-every-legend-character", input: { rows: ["DDwwwsss", "wwsggfhm", "sggfhmbb", "ggTfRhUb", ".tgfhmbm"], look: "flat" } },
  {
    name: "facet-explicit-seeds",
    input: {
      look: "facet",
      tiles: [
        { col: 0, row: 0, terrain: "grass", seed: 1 },
        { col: 1, row: 0, terrain: "forest", feature: "town", seed: 99 },
        { col: 2, row: 1, terrain: "hills", feature: "tent", seed: 5 },
        { col: 3, row: 2, terrain: "mountain", feature: "tower", seed: 7 },
      ],
    },
  },
];
out("tests/fixtures/hexfield-golden.json", {
  ...header,
  cases: fieldCases.map((c) => ({ ...c, expected: runHexField(c.input) })),
});

function runSprite(props) {
  const root = ctx.Sprite({ ...props, pixel: 1 });
  const svg = root.children[0];
  const colours = {};
  for (const p of svg.children[0]) {
    const colour = p.props.style.fill.replace(/^var\(--neo-/, "").replace(/\)$/, "");
    const cells = [];
    for (const m of p.props.d.matchAll(/M(-?\d+) (-?\d+)h(\d+)v1h-\d+z/g)) {
      const [x, y, n] = [Number(m[1]), Number(m[2]), Number(m[3])];
      for (let k = 0; k < n; k++) cells.push(`${x + k},${y}`);
    }
    colours[colour] = cells.sort();
  }
  return colours;
}
const spriteCases = [
  { kind: "user" }, { kind: "robot" }, { kind: "gem" }, { kind: "key" }, { kind: "bug" }, { kind: "user", outline: "cream" },
];
out("tests/fixtures/sprite-golden.json", {
  ...header,
  cases: spriteCases.map((c) => ({ ...c, expected: runSprite(c) })),
});

// --- golden fixtures for the arrow notation and the hex graph overlay ---
const forms = ["->", "<->", "=>", "<=>", "~>", "|->", "o->", "->|", ">-----------||-----------<", "-", "~~~>"];
out("tests/fixtures/arrow-golden.json", {
  ...header,
  cases: forms.flatMap((form) =>
    [4, 0.8].map((sw) => {
      const g = ctx.arrowGeometry(form, sw);
      return { form, sw, expected: { W: g.W, d: g.d, dots: g.dots } };
    }),
  ),
});

function runHexGraph(props) {
  const root = ctx.HexGraph({ ...props, pixel: 1 });
  const edges = [];
  const nodes = [];
  for (const g of root.children[0]) {
    const key = String(g.props.key);
    if (key.startsWith("e")) {
      // children: the casing path (and its dots), then the stroke path (and its dots)
      const paths = g.children[0].filter((k) => k.type === "path");
      const circles = g.children[0].filter((k) => k.type === "circle");
      edges.push({
        transform: g.props.transform,
        casing: { d: paths[0].props.d, width: paths[0].props.style.strokeWidth },
        stroke: { d: paths[1].props.d, width: paths[1].props.style.strokeWidth },
        dots: circles.map((c) => ({ cx: c.props.cx, cy: c.props.cy, r: c.props.r, fill: c.props.style.fill })),
      });
    } else if (key.startsWith("n")) {
      const [casing, node] = g.children[0];
      nodes.push({
        casing: { cx: casing.props.cx, cy: casing.props.cy, r: casing.props.r, fill: casing.props.style.fill },
        node: {
          cx: node.props.cx,
          cy: node.props.cy,
          r: node.props.r,
          fill: node.props.style.fill,
          stroke: node.props.style.stroke,
          strokeWidth: node.props.style.strokeWidth,
        },
      });
    }
  }
  return { edges, nodes };
}
const graphCases = [
  {
    name: "neighbours-in-the-six-directions",
    input: {
      rows: ["gggg", "gggg", "gggg"],
      nodes: [
        { id: "c", col: 1, row: 1, tone: "sun" },
        { id: "e", col: 2, row: 1, tone: "ink" },
        { id: "w", col: 0, row: 1, tone: "coral" },
        { id: "ne", col: 1, row: 0, tone: "iris" },
        { id: "nw", col: 0, row: 0, tone: "sand" },
        { id: "se", col: 1, row: 2, tone: "dusk" },
        { id: "sw", col: 0, row: 2, tone: "baltic", size: 5 },
      ],
      edges: [
        { from: "c", to: "e", form: "->" },
        { from: "c", to: "w", form: "~>" },
        { from: "c", to: "ne", form: "=>" },
        { from: "c", to: "nw", form: "<->" },
        { from: "c", to: "se", form: "->" },
        { from: "c", to: "sw", form: "~>" },
      ],
    },
  },
  {
    name: "small-nodes-and-cells",
    input: {
      rows: ["gggg", "gggg", "gggg"],
      nodes: [
        { id: "a", col: 0, row: 0, tone: "iris", size: 5 },
        { id: "b", col: 1, row: 0, tone: "iris", size: 5 },
        { id: "c", col: 1, row: 1, tone: "sand", size: 5 },
      ],
      edges: [
        { from: "a", to: "b", form: "~>" },
        { from: "b", to: "c", form: "->" },
        { from: "c", to: [2, 1], form: "->", reach: 2 },
        { from: [3, 2], to: "a", form: "->" },
      ],
      nodeSize: 8,
    },
  },
];
out("tests/fixtures/hexgraph-golden.json", {
  ...header,
  cases: graphCases.map((c) => ({ ...c, expected: runHexGraph(c.input) })),
});

// --- golden fixtures for the hex elbow and straight connector (HexElbow) ---
const sides = ["e", "se", "sw", "w", "nw", "ne"];
const elbowCases = [];
for (const a of sides)
  for (const b of sides) {
    if (a === b) continue;
    for (const shaft of ["line", "double"])
      for (const radius of [0, 2.5]) {
        const root = ctx.HexElbow({ ends: [a, b], shaft, radius, pixel: 1 });
        elbowCases.push({ ends: [a, b], shaft, radius, expected: { d: root.children[0][0].props.d } });
      }
  }
out("tests/fixtures/hexelbow-golden.json", { ...header, cases: elbowCases });

// --- golden fixtures for the hex crossing (HexCross) ---
const axisNames = ["ew", "nesw", "nwse"];
const crossCases = [];
for (const a of axisNames)
  for (const b of axisNames) {
    if (a === b) continue;
    for (const style of ["plain", "junction", "bridge", "hop"])
      for (const over of [a, b]) {
        const root = ctx.HexCross({ axes: [a, b], style, over, pixel: 1 });
        const kids = root.children[0];
        crossCases.push({
          axes: [a, b], style, over,
          expected: { d: kids[0].props.d, dots: kids.slice(1).map((c) => [c.props.cx, c.props.cy, c.props.r]) },
        });
      }
  }
for (const style of ["plain", "junction"]) {
  const root = ctx.HexCross({ axes: axisNames, style, pixel: 1 });
  const kids = root.children[0];
  crossCases.push({ axes: axisNames, style, over: undefined, expected: { d: kids[0].props.d, dots: kids.slice(1).map((c) => [c.props.cx, c.props.cy, c.props.r]) } });
}
out("tests/fixtures/hexcross-golden.json", { ...header, cases: crossCases });
