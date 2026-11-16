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
  private sun: Phaser.GameObjects.Image | undefined;
  private sunTexture: Phaser.Textures.CanvasTexture | undefined;
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
    // Four texture pixels per board cell give the large sun smooth gradients and rays without changing the map's scale.
    const sunTexture = this.textures.createCanvas("sun", 64, 68);
    if (!sunTexture) throw new Error('could not create texture "sun"');
    this.sunTexture = sunTexture;
    this.sunTexture.setFilter(Phaser.Textures.FilterMode.LINEAR);
    this.sun = this.add.image(0, 0, "sun").setScale(this.k / 4).setDepth(5);

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
   * The sun is the day's clock, not a meter: a hex-sized sprite crosses the sky as the steps drain, warm at dawn,
   * pale at noon and an ember towards dusk, while the whole world's light cools underneath it. At dusk the day is over.
   */
  private drawSky(): void {
    const sky = this.sky;
    if (!sky) return;
    sky.clear();
    const f = Math.max(0, Math.min(1, 1 - this.state.player.steps / START_STEPS)); // 0 dawn, 1 dusk
    const [x0, yTop] = tileCentre(0, 0);
    const [x1, yBottom] = tileCentre(COLS - 1, ROWS - 1);
    const x = x0 + 1 + (x1 - 2 - x0) * f;
    const y = yTop + 5.5 - 5.5 * 4 * f * (1 - f); // low at the horizons, high at noon, always in frame
    const mix = (a: number, b: number, t: number) => {
      const ca = Phaser.Display.Color.IntegerToColor(a);
      const cb = Phaser.Display.Color.IntegerToColor(b);
      return Phaser.Display.Color.GetColor(
        Math.round(ca.red + (cb.red - ca.red) * t),
        Math.round(ca.green + (cb.green - ca.green) * t),
        Math.round(ca.blue + (cb.blue - ca.blue) * t),
      );
    };
    const body = f < 0.5 ? mix(0xffb45f, 0xfff4c8, 2 * f) : mix(0xfff4c8, 0xff6b3d, 2 * (f - 0.5));
    const noon = Math.sin(Math.PI * f); // the rays strengthen to noon, then recede
    const ray = mix(body, 0xffffee, 0.18 + 0.3 * noon);
    this.paintSun(body, ray, noon);
    this.sun?.setPosition(x * this.k, y * this.k);
    // the light cools as the day drains: dusk settles over the ground
    sky.fillStyle(0x0e1a3a, 0.3 * f * f);
    sky.fillRect(x0 - 1, yTop - 6, x1 - x0 + 3, yBottom - yTop + 7.5);
  }

  /** Paint one day's sun into its persistent texture: a full hex, with the rays at their strongest at noon. */
  private paintSun(body: number, ray: number, noon: number): void {
    const texture = this.sunTexture;
    if (!texture) return;
    const ctx = texture.getContext();
    const rgba = (colour: number, alpha: number) => {
      const c = Phaser.Display.Color.IntegerToColor(colour);
      return `rgba(${c.red}, ${c.green}, ${c.blue}, ${alpha})`;
    };
    ctx.clearRect(0, 0, texture.width, texture.height);
    ctx.save();
    ctx.scale(4, 4); // texture pixels -> the 16 by 17 board-cell hex
    const x = 8;
    const y = 8.5;
    const radius = 5.9 + 0.35 * noon;

    const halo = ctx.createRadialGradient(x, y, radius * 0.65, x, y, 8.3);
    halo.addColorStop(0, rgba(ray, 0.14 + 0.2 * noon));
    halo.addColorStop(0.65, rgba(ray, 0.06 + 0.1 * noon));
    halo.addColorStop(1, rgba(ray, 0));
    ctx.fillStyle = halo;
    ctx.fillRect(0, 0, 16, 17);

    // Alternating ray lengths keep the disc legible as a sun even at the board's small pixel scale.
    ctx.strokeStyle = rgba(ray, 0.3 + 0.7 * noon);
    ctx.lineWidth = 0.35 + 0.4 * noon;
    ctx.lineCap = "round";
    for (let i = 0; i < 12; i++) {
      const angle = (i * Math.PI) / 6;
      const inner = radius + 0.35;
      const outer = radius + 0.65 + 0.95 * noon + (i % 2 === 0 ? 0.2 : 0);
      ctx.beginPath();
      ctx.moveTo(x + Math.cos(angle) * inner, y + Math.sin(angle) * inner);
      ctx.lineTo(x + Math.cos(angle) * outer, y + Math.sin(angle) * outer);
      ctx.stroke();
    }

    const disc = ctx.createRadialGradient(x - 1.5, y - 1.8, 0.4, x, y, radius);
    disc.addColorStop(0, rgba(ray, 1));
    disc.addColorStop(0.7, rgba(body, 1));
    disc.addColorStop(1, rgba(body, 0.94));
    ctx.fillStyle = disc;
    ctx.beginPath();
    ctx.arc(x, y, radius, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
    texture.refresh();
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
