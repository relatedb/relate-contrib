// Draws the board by what the player knows (ADR-011, 2.3): hidden hexes are fog, sensed hexes are drawn in the
// flat look (just the ground's colour), and discovered hexes (seen or on a path) in the pixel look. The scene reads
// only the cache in GameState and never awaits; it redraws when the cache's version changes.
import Phaser from "phaser";
import {
  layoutGraph,
  paintScene,
  placeWave,
  tileCentre,
  type GraphEdge,
  type GraphNode,
  type GraphPiece,
  type Point,
  type Tile,
} from "../hex/core/index.js";
import { addSceneTexture, drawGraph, drawRing, drawVectorTile, fillHex, strokeHex } from "../hex/phaser/index.js";
import { routeToGraph, routes, withCrossings } from "./routes.js";
import type { GameState, HexState } from "./state.js";
import { COLS, ROWS, START_STEPS } from "./world.js";

/** Screen pixels per lattice cell; a whole number keeps pixel edges crisp. */
export const DEFAULT_PIXEL = 3;

export class MapScene extends Phaser.Scene {
  private vector!: Phaser.GameObjects.Graphics;
  private thread!: Phaser.GameObjects.Graphics;
  private overlay!: Phaser.GameObjects.Graphics;
  private ground?: Phaser.GameObjects.Image;
  private drawn = -1;
  /** The sun and the day's light: the clock that is not a meter. */
  private sky: Phaser.GameObjects.Graphics | undefined;
  private hover: HexState | undefined;
  /** True after a key press until the pointer moves: only then is the preview of the faced hex shown. */
  private keyboard = false;

  /** Canvas pixels per lattice cell: the chosen pixel size times the display's pixel density. */
  private readonly k: number;

  constructor(
    private readonly state: GameState,
    pixel = DEFAULT_PIXEL,
    dpr = 1,
    private readonly onChange: (state: GameState) => void = () => {},
  ) {
    super("map");
    this.k = pixel * dpr;
  }

  create(): void {
    this.cameras.main.setBackgroundColor("#002b43");
    this.vector = this.add.graphics().setScale(this.k).setDepth(0);
    this.thread = this.add.graphics().setScale(this.k).setDepth(2);
    this.overlay = this.add.graphics().setScale(this.k).setDepth(3);
    this.sky = this.add.graphics().setScale(this.k).setDepth(4);

    // keys, as in a space shooter: left and right turn (a sixth of a turn each), up acts on the hex ahead and down
    // on the hex behind; shift steps instead of extending; backspace reels in
    const kb = this.input.keyboard;
    kb?.addCapture("LEFT,RIGHT,UP,DOWN,BACKSPACE"); // keep the page from scrolling
    const key = (name: string, run: (e: KeyboardEvent) => void) =>
      kb?.on(`keydown-${name}`, (e: KeyboardEvent) => {
        this.keyboard = true;
        run(e);
        this.drawOverlay();
      });
    key("LEFT", () => this.state.turn(-1));
    key("RIGHT", () => this.state.turn(1));
    key("UP", (e) => void this.state.go(false, { step: e.shiftKey }));
    key("DOWN", (e) => void this.state.go(true, { step: e.shiftKey }));
    key("BACKSPACE", () => void this.state.reelIn());
    key("P", () => void this.state.placeWaymarker());
    key("E", () => void this.state.endDay());
    this.input.on("pointermove", (p: Phaser.Input.Pointer) => {
      const t = this.tileUnder(p);
      if (this.keyboard || t?.id !== this.hover?.id) {
        this.keyboard = false; // the pointer is in charge again
        this.hover = t;
        this.drawOverlay();
      }
    });
    this.input.on("pointerdown", (p: Phaser.Input.Pointer) => {
      const t = this.tileUnder(p);
      if (t) void this.state.click(t.id, { step: p.event.shiftKey });
    });
  }

  override update(): void {
    // the frame loop reads the cache only; it redraws when something changed
    if (this.drawn !== this.state.version) {
      this.drawn = this.state.version;
      this.redraw();
      this.onChange(this.state);
    }
  }

  private tileUnder(p: Phaser.Input.Pointer): HexState | undefined {
    const x = p.worldX / this.k;
    const y = p.worldY / this.k;
    let best: HexState | undefined;
    let bestD = 9; // within about half a tile of a centre
    for (const t of this.state.tiles.values()) {
      const [cx, cy] = tileCentre(t.col, t.row);
      const d = Math.hypot(x - cx, y - cy);
      if (d < bestD) {
        bestD = d;
        best = t;
      }
    }
    return best;
  }

  private redraw(): void {
    const g = this.vector;
    g.clear();
    const discovered: Tile[] = [];
    for (const t of this.state.tiles.values()) {
      if (t.state === "hidden") {
        fillHex(g, t.col, t.row, "dark-baltic"); // fog: one flat colour, no outline
      } else if (t.state === "sensed" && t.terrain) {
        drawVectorTile(g, { col: t.col, row: t.row, terrain: t.terrain }, "flat", 0.2); // the ground's colour, dimmed: known, not yet walked
      } else if (t.terrain) {
        discovered.push({ col: t.col, row: t.row, terrain: t.terrain, feature: t.feature });
      }
    }
    // the pixel look for what the explorer has walked or seen, on a texture the size of the board
    this.ground?.destroy();
    this.ground = undefined;
    if (discovered.length) {
      const blank = Array.from({ length: ROWS }, () => " ".repeat(COLS));
      addSceneTexture(this, "ground", paintScene(discovered, blank));
      this.ground = this.add.image(0, 0, "ground").setOrigin(0, 0).setScale(this.k).setDepth(1);
    }
    this.drawThread();
    this.drawOverlay();
    this.drawSky();
  }

  /**
   * The sun is the day's clock, not a meter: it crosses the sky as the steps drain, warm at dawn, pale at noon and an
   * ember towards dusk, while the whole world's light cools underneath it. At dusk the day is over.
   */
  private drawSky(): void {
    const sky = this.sky;
    if (!sky) return;
    sky.clear();
    const f = Math.max(0, Math.min(1, 1 - this.state.player.steps / START_STEPS)); // 0 dawn, 1 dusk
    const [x0, yTop] = tileCentre(0, 0);
    const [x1, yBottom] = tileCentre(COLS - 1, ROWS - 1);
    const x = x0 + 1 + (x1 - 2 - x0) * f;
    const y = yTop + 2.6 - 7.4 * 4 * f * (1 - f); // low at the horizons, high at noon
    const mix = (a: number, b: number, t: number) => {
      const ca = Phaser.Display.Color.IntegerToColor(a);
      const cb = Phaser.Display.Color.IntegerToColor(b);
      return Phaser.Display.Color.GetColor(
        Math.round(ca.red + (cb.red - ca.red) * t),
        Math.round(ca.green + (cb.green - ca.green) * t),
        Math.round(ca.blue + (cb.blue - ca.blue) * t),
      );
    };
    const body = f < 0.5 ? mix(0xffd27f, 0xfff4c8, 2 * f) : mix(0xfff4c8, 0xff7a3f, 2 * (f - 0.5));
    sky.fillStyle(body, 0.14);
    sky.fillCircle(x, y, 2.2); // the halo
    sky.fillStyle(body, 1);
    sky.fillCircle(x, y, 0.95);
    // the light cools as the day drains: dusk settles over the ground
    sky.fillStyle(0x0e1a3a, 0.3 * f * f);
    sky.fillRect(x0 - 1, yTop - 6, x1 - x0 + 3, yBottom - yTop + 7.5);
  }

  /** The size of the rings that mark the camp, the towers and the explorer: all the same. */
  private static readonly RING = 8;

  /**
   * The thread and the paths as the design system's hex graph: routes from a marked hex to the next, made of elbows
   * and straight connectors through the hexes between and an arrow link at each end, a single line for the loose
   * thread and a double one for a secured path. The camp, the towers and the explorer are marked with rings of one
   * size and no fill, a 1-cell stroke like the design system's nodes: red for the camp, light blue for a tower,
   * yellow for the explorer (whose ring replaces an anchor's when it stands on one).
   */
  private drawThread(): void {
    const g = this.thread;
    g.clear();
    const tiles = this.state.tiles;
    const here = this.state.here();
    const marked = new Set<string>();
    for (const t of tiles.values()) if (t.anchor && t.state !== "hidden") marked.add(t.id);
    if (here) marked.add(here.id);
    const { routes: found, ends } = routes(this.state.edges, marked, tiles);
    for (const id of ends) marked.add(id);
    const nodes: GraphNode[] = [];
    for (const id of marked) {
      const t = tiles.get(id);
      if (t) nodes.push({ id, col: t.col, row: t.row, size: MapScene.RING });
    }
    const pieces: GraphPiece[] = [];
    const edges: GraphEdge[] = [];
    const waves: Point[][] = [];
    for (const r of found) {
      const route = routeToGraph(r, tiles, MapScene.RING);
      pieces.push(...route.pieces);
      edges.push(...route.edges);
      waves.push(...route.waves);
    }
    // the routes only; the markers are rings, drawn after
    const placed = layoutGraph(nodes, edges, {}, withCrossings(pieces));
    placed.pieces.push(...waves.map((w) => placeWave(w)));
    drawGraph(g, { ...placed, nodes: [] });
    for (const id of marked) {
      const t = tiles.get(id);
      if (!t || t.id === here?.id) continue; // the explorer's ring takes the place of an anchor's
      const colour = t.anchor ? (t.feature === "tent" ? "mid-hibiscus" : "light-baltic") : "dark-gray";
      if (t.anchor || ends.has(id)) drawRing(g, t.col, t.row, MapScene.RING, colour);
    }
    if (here) drawRing(g, here.col, here.row, MapScene.RING, "yellow");
  }

  /**
   * A preview of the move ahead, while the keyboard is in use: the ring that would stand on the faced hex and, for an
   * extension, the arrow that would join the two (wavy while the thread is loose); for a reel-in, the ring behind the
   * explorer and the arrow back to it; for a step, the ring alone. Nothing is drawn when the move is refused.
   */
  private drawPreview(o: Phaser.GameObjects.Graphics): void {
    const here = this.state.here();
    const ahead = this.state.faced();
    if (!here || !ahead) return;
    const i = this.state.intent(ahead.id);
    if (i.kind === "none" || i.kind === "travel") return;
    const alpha = 0.55;
    drawRing(o, ahead.col, ahead.row, MapScene.RING, "yellow", 1, 0.5, alpha);
    if (i.kind === "step") return;
    const form = i.kind === "extend" ? "~>" : "->";
    const nodes: GraphNode[] = [
      { id: "from", col: here.col, row: here.row, size: MapScene.RING },
      { id: "to", col: ahead.col, row: ahead.row, size: MapScene.RING },
    ];
    drawGraph(o, { ...layoutGraph(nodes, [{ from: "from", to: "to", form }]), nodes: [] }, alpha);
  }

  private drawOverlay(): void {
    const o = this.overlay;
    o.clear();
    const t = this.hover;
    if (t && this.state.canExtend(t.id)) strokeHex(o, t.col, t.row, "cream", 0.7, 1);
    if (this.state.pending) {
      const p = this.state.tiles.get(this.state.pending);
      if (p) strokeHex(o, p.col, p.row, "light-baltic", 0.7, 1);
    }
    if (this.keyboard) this.drawPreview(o);
  }
}

export function boardSizePx(pixel = DEFAULT_PIXEL): { width: number; height: number } {
  const blank = Array.from({ length: ROWS }, () => " ".repeat(COLS));
  const s = paintScene([{ col: COLS - 1, row: ROWS - 1, terrain: "grass" }], blank);
  return { width: s.width * pixel, height: s.height * pixel };
}
