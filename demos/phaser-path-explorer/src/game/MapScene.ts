// Draws the board by what the player knows (ADR-011, 2.3): hidden hexes are fog, sensed hexes are drawn in the
// flat look (just the ground's colour), and discovered hexes (seen or on a path) in the pixel look. The scene reads
// only the cache in GameState and never awaits; it redraws when the cache's version changes.
import Phaser from "phaser";
import {
  HEX_OUTLINE,
  hexSpan,
  layoutGraph,
  neighbours,
  paintScene,
  placeWave,
  tileCentre,
  tileOrigin,
  type GraphEdge,
  type GraphNode,
  type GraphPiece,
  type PlacedLink,
  type PlacedPiece,
  type Point,
  type Tile,
} from "../hex/core/index.js";
import { addSceneTexture, colourNumber, drawGraph, drawRing, drawVectorTile, fillHex, mixColour, strokeHex } from "../hex/phaser/index.js";
import { routeToGraph, routes, withCrossings } from "./routes.js";
import type { DuskHex, GameState, HexState } from "./state.js";
import { COLS, ROWS, START_STEPS } from "./world.js";

/** Screen pixels per lattice cell; a whole number keeps pixel edges crisp. */
export const DEFAULT_PIXEL = 3;

/** Interpolate two RGB integers without relying on Phaser's colour objects having a lerp method. */
function mix(a: number, b: number, t: number): number {
  const ca = Phaser.Display.Color.IntegerToColor(a);
  const cb = Phaser.Display.Color.IntegerToColor(b);
  return Phaser.Display.Color.GetColor(
    Math.round(ca.red + (cb.red - ca.red) * t),
    Math.round(ca.green + (cb.green - ca.green) * t),
    Math.round(ca.blue + (cb.blue - ca.blue) * t),
  );
}

export class MapScene extends Phaser.Scene {
  private vector!: Phaser.GameObjects.Graphics;
  private thread!: Phaser.GameObjects.Graphics;
  /** The short pull from loose wave to secured line, over the redrawn thread. */
  private bankThread!: Phaser.GameObjects.Graphics;
  private bank:
    | {
        key: string;
        waymark: string;
        oldLinks: PlacedLink[];
        oldBodies: Point[][];
        newPieces: PlacedPiece[];
        newLinks: PlacedLink[];
        turn: { t: number };
      }
    | undefined;
  private overlay!: Phaser.GameObjects.Graphics;
  private ground?: Phaser.GameObjects.Image;
  private drawn = -1;
  /** The sun and the day's light: the clock that is not a meter. */
  private sky: Phaser.GameObjects.Graphics | undefined;
  private sun: Phaser.GameObjects.Image | undefined;
  private sunTexture: Phaser.Textures.CanvasTexture | undefined;
  private hover: HexState | undefined;
  /** The terrain next to the explorer with relief: mountains lifted, water dropped. */
  private relief = new Map<string, { image: Phaser.GameObjects.Image; offset: number; flat: boolean }>();
  private reliefFaces!: Phaser.GameObjects.Graphics;
  /** True after a key press until the pointer moves: only then is the preview of the faced hex shown. */
  private keyboard = false;
  /** Extra dusk while the day's fog settles, on top of the sun's own light. */
  private dusk = 0;

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
    // Beneath every terrain: a sinking shore must pass under pixel-art and vector neighbours alike.
    this.reliefFaces = this.add.graphics().setScale(this.k).setDepth(-0.2);
    this.thread = this.add.graphics().setScale(this.k).setDepth(2);
    this.bankThread = this.add.graphics().setScale(this.k).setDepth(2.3);
    this.overlay = this.add.graphics().setScale(this.k).setDepth(3);
    this.sky = this.add.graphics().setScale(this.k).setDepth(4);
    // One texture pixel per board cell, like the terrain: the large sun is pixel art, not a smooth vector disc.
    const sunTexture = this.textures.createCanvas("sun", 16, 17);
    if (!sunTexture) throw new Error('could not create texture "sun"');
    this.sunTexture = sunTexture;
    this.sunTexture.setFilter(Phaser.Textures.FilterMode.NEAREST);
    this.sun = this.add.image(0, 0, "sun").setScale(this.k).setDepth(5);

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
    this.startBank();
    const raised = this.syncRelief();
    const discovered: Tile[] = [];
    for (const t of this.state.tiles.values()) {
      if (raised.has(t.id)) continue; // its relief sprite takes this tile's place
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
    this.startDusk();
    this.drawSky();
  }

  /**
   * Settle the day's fog: each forgotten hex keeps its remembered look while the dusk deepens, then fades away in
   * rings from the abandoned thread outward. Secured ground and its disclosed edges were never in the answer.
   */
  private startDusk(): void {
    const ghosts: DuskHex[] = this.state.lastFogged;
    this.state.lastFogged = []; // consumed once; a later redraw shows only the settled board
    if (!ghosts.length) {
      this.dusk = 0;
      return;
    }
    const version = this.state.version;
    let lastRing = 0;
    for (const ghost of ghosts) {
      if (!ghost.terrain) continue;
      const key = `dusk-${version}-${ghost.id}`;
      if (this.textures.exists(key)) this.textures.remove(key);
      if (ghost.state === "sensed") {
        // A silhouette only: sensed ground never carried the pixel look.
        const texture = this.textures.createCanvas(key, 16, 17);
        if (!texture) throw new Error(`could not create texture "${key}"`);
        const ctx = texture.getContext();
        const base = ghost.terrain === "mountain" ? "mid-forest" : ghost.terrain === "deep" ? "dark-baltic" : "mid-baltic";
        ctx.fillStyle = `#${mixColour(base, "darkest-baltic", 0.2).toString(16).padStart(6, "0")}`;
        for (let y = 0; y < 17; y++) {
          const w = hexSpan(y);
          ctx.fillRect((16 - w) / 2, y, w, 1);
        }
        texture.refresh();
        texture.setFilter(Phaser.Textures.FilterMode.NEAREST);
      } else {
        addSceneTexture(this, key, paintScene([{ col: 0, row: 0, terrain: ghost.terrain, feature: ghost.feature }]));
      }
      const tile = this.state.tiles.get(ghost.id);
      if (!tile) continue;
      const [ox, oy] = tileOrigin(tile.col, tile.row);
      const image = this.add.image(ox * this.k, oy * this.k, key).setOrigin(0).setScale(this.k).setDepth(2.4);
      this.tweens.add({
        targets: image,
        alpha: 0,
        delay: ghost.ring * 90,
        duration: 420,
        ease: "Quad.easeOut",
        onComplete: () => {
          image.destroy();
          if (this.textures.exists(key)) this.textures.remove(key);
        },
      });
      lastRing = Math.max(lastRing, ghost.ring);
    }
    this.tweens.addCounter({
      from: 0,
      to: 1,
      duration: 280 + lastRing * 90 + 460,
      ease: "Sine.easeIn",
      onUpdate: (_tween, _target, _key, current) => {
        this.dusk = current;
        this.drawSky();
      },
      onComplete: () =>
        this.tweens.addCounter({
          from: 1,
          to: 0,
          duration: 520,
          ease: "Sine.easeOut",
          onUpdate: (_tween, _target, _key, current) => {
            this.dusk = current;
            this.drawSky();
          },
        }),
    });
  }

  /**
   * The relief is the cost's language: a neighbouring mountain lifts (a step up), neighbouring water drops away (the
   * edge of the world), and both settle back as the explorer moves on. Tiles keep their sprite once raised, so a
   * returning tile eases home instead of popping back into the ground texture. Sensed ground stays a dim silhouette.
   */
  private syncRelief(): Set<string> {
    const here = this.state.here();
    const near = new Set(
      here ? neighbours(here.col, here.row).map(([c, r]) => this.state.tileAt(c, r)?.id) : [],
    );
    const active = new Set<string>();
    for (const t of this.state.tiles.values()) {
      if (!t.terrain || t.state === "hidden") continue;
      const relief = t.terrain === "mountain" ? -2.4 : t.terrain === "water" || t.terrain === "deep" ? 2 : 0;
      const flat = t.state === "sensed";
      const known = relief !== 0;
      let entry = this.relief.get(t.id);
      if (entry && (entry.flat !== flat || !known)) {
        this.tweens.killTweensOf(entry);
        entry.image.destroy();
        this.relief.delete(t.id);
        entry = undefined;
      }
      if (!known) continue;
      if (!entry) {
        const key = `relief-${t.id}-${flat ? "sensed" : "seen"}`;
        if (this.textures.exists(key)) this.textures.remove(key);
        if (flat) {
          const texture = this.textures.createCanvas(key, 16, 17);
          if (!texture) throw new Error(`could not create texture "${key}"`);
          const ctx = texture.getContext();
          const base = t.terrain === "mountain" ? "mid-forest" : t.terrain === "deep" ? "dark-baltic" : "mid-baltic";
          const dim = mixColour(base, "darkest-baltic", 0.2);
          ctx.fillStyle = `#${dim.toString(16).padStart(6, "0")}`;
          for (let y = 0; y < 17; y++) {
            const w = hexSpan(y);
            ctx.fillRect((16 - w) / 2, y, w, 1);
          }
          texture.refresh();
          texture.setFilter(Phaser.Textures.FilterMode.NEAREST);
        } else {
          addSceneTexture(this, key, paintScene([{ col: 0, row: 0, terrain: t.terrain, feature: t.feature }]));
        }
        const [ox, oy] = tileOrigin(t.col, t.row);
        // Raised land stands over the board; sunk water slides underneath every kind of neighbouring terrain.
        const depth = t.terrain === "mountain" ? 1.5 : -0.1;
        const image = this.add.image(ox * this.k, oy * this.k, key).setOrigin(0).setScale(this.k).setDepth(depth);
        entry = { image, offset: 0, flat };
        this.relief.set(t.id, entry);
      }
      active.add(t.id);
      const target = near.has(t.id) ? relief : 0;
      if (entry.offset !== target) {
        this.tweens.killTweensOf(entry);
        this.tweens.add({
          targets: entry,
          offset: target,
          duration: 180,
          ease: "Sine.easeOut",
          onUpdate: () => {
            entry!.image.y = (tileOrigin(t.col, t.row)[1] + entry!.offset) * this.k;
            this.drawReliefFaces();
          },
        });
      }
      entry.image.y = (tileOrigin(t.col, t.row)[1] + entry.offset) * this.k;
    }
    for (const [id, entry] of this.relief) {
      const t = this.state.tiles.get(id);
      if (!t?.terrain || t.state === "hidden" || (t.terrain !== "mountain" && t.terrain !== "water" && t.terrain !== "deep")) {
        this.tweens.killTweensOf(entry);
        entry.image.destroy();
        this.relief.delete(id);
        if (this.textures.exists(`relief-${id}-sensed`)) this.textures.remove(`relief-${id}-sensed`);
        if (this.textures.exists(`relief-${id}-seen`)) this.textures.remove(`relief-${id}-seen`);
      }
    }
    this.drawReliefFaces();
    return active;
  }

  /** The dark faces beneath raised mountains and at the rims of sunk water, in board cells like the other vectors. */
  private drawReliefFaces(): void {
    const g = this.reliefFaces;
    if (!g) return;
    g.clear();
    for (const [id, entry] of this.relief) {
      const t = this.state.tiles.get(id);
      if (!t?.terrain) continue;
      const [ox, oy] = tileOrigin(t.col, t.row);
      const colour = t.terrain === "mountain" ? "forest" : t.terrain === "deep" ? "darkest-baltic" : "dark-baltic";
      g.fillStyle(colourNumber(colour), 1);
      const pts: Phaser.Math.Vector2[] = [];
      for (let i = 0; i < HEX_OUTLINE.length; i += 2) {
        pts.push(new Phaser.Math.Vector2(ox + HEX_OUTLINE[i]!, oy + HEX_OUTLINE[i + 1]! + entry.offset));
      }
      g.fillPoints(pts, true);
    }
  }


  /**
   * The sun is the day's clock, not a meter: a hex-sized sprite crosses the top row as the steps drain, warm at dawn,
   * pale at noon and an ember towards dusk, while the whole world's light cools underneath it. At dusk the day is over.
   */
  private drawSky(): void {
    const sky = this.sky;
    if (!sky) return;
    sky.clear();
    const f = Math.max(0, Math.min(1, 1 - this.state.player.steps / START_STEPS)); // 0 dawn, 1 dusk
    const [x0, yTop] = tileCentre(0, 0);
    const [x1, yBottom] = tileCentre(COLS - 1, ROWS - 1);
    // A straight, grid-aligned crossing: dawn at the leftmost centre, noon at the middle, dusk at the right.
    const [x, y] = tileCentre(Math.round(f * (COLS - 1)), 0);
    const body = f < 0.5 ? mix(0xffb45f, 0xfff4c8, 2 * f) : mix(0xfff4c8, 0xff6b3d, 2 * (f - 0.5));
    const noon = Math.sin(Math.PI * f) * (1 - this.dusk); // the sun's rays fall away overnight
    const nightBody = mix(body, 0xc7dcf0, this.dusk);
    const ray = mix(nightBody, 0xffffee, (0.18 + 0.3 * noon) * (1 - this.dusk));
    this.paintSun(nightBody, ray, noon);
    this.sun?.setPosition(x * this.k, y * this.k);
    // The light cools as the day drains, and deepens for a breath while the day's fog settles.
    sky.fillStyle(0x07152b, Math.min(0.82, 0.3 * f * f + 0.52 * this.dusk));
    sky.fillRect(x0 - 1, yTop - 6, x1 - x0 + 3, yBottom - yTop + 7.5);
  }

  /** Paint whole texture pixels, exactly like a terrain sprite; the disc and its rays have no antialiased edges. */
  private paintSun(body: number, ray: number, noon: number): void {
    const texture = this.sunTexture;
    if (!texture) return;
    const image = texture.getContext().createImageData(16, 17);
    const pixel = (x: number, y: number, colour: number, alpha = 255) => {
      if (x < 0 || x >= 16 || y < 0 || y >= 17) return;
      const i = (y * 16 + x) * 4;
      image.data[i] = (colour >> 16) & 255;
      image.data[i + 1] = (colour >> 8) & 255;
      image.data[i + 2] = colour & 255;
      image.data[i + 3] = alpha;
    };
    const line = (x0: number, y0: number, x1: number, y1: number, alpha: number) => {
      const steps = Math.ceil(Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0)));
      for (let i = 0; i <= steps; i++) {
        const t = steps === 0 ? 0 : i / steps;
        pixel(Math.round(x0 + (x1 - x0) * t), Math.round(y0 + (y1 - y0) * t), ray, alpha);
      }
    };
    const x = 7.5;
    const y = 8;
    const radius = 5.65;
    // Rasterized one-pixel rays: longer and more opaque at noon, short and subdued at the horizons.
    for (let i = 0; i < 12; i++) {
      const angle = (i * Math.PI) / 6;
      const inner = radius + 0.3;
      const outer = radius + 0.55 + 1.5 * noon + (i % 2 === 0 ? 0.25 : 0);
      line(
        x + Math.cos(angle) * inner,
        y + Math.sin(angle) * inner,
        x + Math.cos(angle) * outer,
        y + Math.sin(angle) * outer,
        Math.round(255 * (0.4 + 0.6 * noon)),
      );
    }
    // Three flat tones give the disc a lit edge and a shaded edge, without gradients or smooth drawing primitives.
    const highlight = mix(body, 0xffffee, 0.55);
    const shade = mix(body, 0x783b36, 0.22);
    for (let py = 0; py < 17; py++) {
      for (let px = 0; px < 16; px++) {
        const dx = px - x;
        const dy = py - y;
        if (dx * dx + dy * dy > radius * radius) continue;
        const moon = this.dusk > 0 && dx > x + radius * (1 - 2 * this.dusk);
        const colour = moon
          ? mix(0xc7dcf0, 0x07152b, 0.78)
          : dx + dy < -2 ? highlight : dx + dy > 4 ? shade : body;
        pixel(px, py, colour);
      }
    }
    texture.getContext().putImageData(image, 0, 0);
    texture.refresh();
  }

  /**
   * Bank a path: keep its loose wave on screen for a moment, pull it taut, then crossfade into the secured double
   * line. A small pulse on the new anchor confirms that these steps are safe. The day does not turn; that belongs to
   * the end-of-day fog alone.
   */
  private startBank(): void {
    const banked = this.state.lastBanked;
    if (!banked) return;
    this.state.lastBanked = null;
    if (this.bank) {
      this.tweens.killTweensOf(this.bank.turn);
      this.bankThread.clear();
      this.bank = undefined;
    }
    const tiles = this.state.tiles;
    const marked = new Set<string>();
    for (const t of tiles.values()) if (t.anchor && t.state !== "hidden") marked.add(t.id);
    if (this.state.here()) marked.add(this.state.player.at);
    const oldRoute = routes(banked.edges, marked, tiles).routes.find(
      (r) => r.kind === "LOOSE" && r.from === banked.from && r.to === banked.waymark,
    );
    const securedRoute = routes(this.state.edges, marked, tiles).routes.find(
      (r) => r.kind === "SECURED" && r.from === banked.from && r.to === banked.waymark,
    );
    if (!oldRoute || !securedRoute) return;
    const nodes: GraphNode[] = [];
    for (const id of marked) {
      const t = tiles.get(id);
      if (t) nodes.push({ id, col: t.col, row: t.row, size: MapScene.RING });
    }
    const oldParts = routeToGraph(oldRoute, tiles, MapScene.RING);
    const securedParts = routeToGraph(securedRoute, tiles, MapScene.RING);
    const secured = layoutGraph(nodes, securedParts.edges, {}, withCrossings(securedParts.pieces));
    const turn = { t: 0 };
    this.bank = {
      key: `${banked.from}>${banked.waymark}`,
      waymark: banked.waymark,
      oldLinks: layoutGraph(nodes, oldParts.edges, {}).links,
      oldBodies: oldParts.waves,
      newPieces: secured.pieces,
      newLinks: secured.links,
      turn,
    };
    this.tweens.add({
      targets: turn,
      t: 1,
      duration: 520,
      ease: "Sine.easeInOut",
      onUpdate: () => this.drawBank(),
      onComplete: () => {
        this.bankThread.clear();
        this.bank = undefined;
        this.drawThread(); // the secured route is no longer omitted
      },
    });
    this.drawBank();
  }

  private drawBank(): void {
    const bank = this.bank;
    if (!bank) return;
    const g = this.bankThread;
    const clamp = (x: number) => Math.max(0, Math.min(1, x));
    const smooth = (x: number) => x * x * (3 - 2 * x);
    const t = clamp(bank.turn.t);
    const pull = smooth(clamp(t / 0.58));
    const waveAlpha = 1 - smooth(clamp((t - 0.52) / 0.2));
    const securedAlpha = smooth(clamp((t - 0.52) / 0.42));
    g.clear();
    drawGraph(
      g,
      { pieces: bank.oldBodies.map((body) => placeWave(body, { amplitude: 1.2 * (1 - pull) })), links: bank.oldLinks, nodes: [] },
      waveAlpha,
    );
    drawGraph(g, { pieces: bank.newPieces, links: bank.newLinks, nodes: [] }, securedAlpha);
    const pulse = smooth(clamp((t - 0.58) / 0.42));
    if (pulse > 0) {
      const tile = this.state.tiles.get(bank.waymark);
      if (tile) drawRing(g, tile.col, tile.row, 9.5 + 6.5 * pulse, "light-baltic", 1, 0.5, 0.8 * (1 - pulse));
    }
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
      if (this.bank && r.kind === "SECURED" && `${r.from}>${r.to}` === this.bank.key) continue; // the transition draws this one
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
