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
import { addSceneTexture, addSpriteTexture, colourNumber, drawGraph, drawVectorTile, fillHex, mixColour, strokeHex } from "../hex/phaser/index.js";
import { addGameSprite } from "./sprites.js";
import { cloudCell, cloudDensity } from "./clouds.js";
import { ROBOT_COLOURS, robotCells, robotSlot } from "./robot.js";
import { sideTo, SIDES_CLOCKWISE, neighbourAt } from "../hex/core/index.js";
import { paletteAsset, spritesAsset } from "../hex/assets/index.js";
import { routeToGraph, routes, withCrossings, type Route } from "./routes.js";
import type { DuskHex, GameState, HexState } from "./state.js";
import { COLS, DAYS, ROWS, START_MARKERS, START_STEPS } from "./world.js";

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

/**
 * The board's layers, back to front (ADR-011, amended): the empty board, the vector tiles, the pixelated terrain, the
 * graph paths, the sprites, then the sun and the sky. Raised relief and the dusk ghosts sit within the layer they
 * belong to; the overlay (hover and preview) is a translucent aid between the paths and the sprites.
 */
const LAYER = {
  board: -0.3,
  vector: 0,
  terrain: 1,
  graph: 2,
  overlay: 3,
  sprites: 3.5,
  clouds: 3.9,
  sky: 4,
  sun: 5,
} as const;

/** How long the night takes, in milliseconds: dusk, nightfall, midnight, the small hours, dawn. */
const NIGHT_MS = 3600;
/** The moment of the night (0 to 1) at which the moon reaches the left: midnight, when the explorer is home. */
const MIDNIGHT = 0.58;

/** Where the waymarkers pile round the camp, as offsets of the 4 by 6 flag from the camp tile's corner: its rim. */
const PILE: [number, number][] = [
  [2, 3],
  [10, 3],
  [0, 9],
  [12, 9],
  [6, 11],
];
/** Where a waymarker stands on its tile: the middle (it is only ever placed on open ground, never on a settlement). */
const STAND: [number, number] = [6, 5];

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
  /** The signposts: arrowheads just outside each settlement the explorer has arrived at, pointing the way. */
  private signs!: Phaser.GameObjects.Graphics;
  private ground?: Phaser.GameObjects.Image;
  private drawn = -1;
  /** The sun and the day's light: the clock that is not a meter. */
  private sky: Phaser.GameObjects.Graphics | undefined;
  private sun: Phaser.GameObjects.Image | undefined;
  private sunTexture: Phaser.Textures.CanvasTexture | undefined;
  private hover: HexState | undefined;
  /** The explorer, and the faint one that shows where the faced move would take them. */
  private explorer: Phaser.GameObjects.Image | undefined;
  private explorerAt = "";
  private ghost: Phaser.GameObjects.Image | undefined;
  /** The waymarkers still in the bag, piled round the camp, and those standing on the board. */
  private pile: Phaser.GameObjects.Image[] = [];
  private flags = new Map<string, Phaser.GameObjects.Image>();
  private flying = new Set<string>();
  /** The grey clouds over the unknown, and the hexes they were last painted for. */
  private clouds: Phaser.GameObjects.Image | undefined;
  private cloudKey = "";
  /** How far the weather has drifted east, in board cells; the clouds are sampled this far behind. */
  private cloudDrift = 0;
  /** The robot along the bottom row: its parts so far, and the faint outline of the whole of it. */
  private robot: Phaser.GameObjects.Image | undefined;
  private robotGhost: Phaser.GameObjects.Image | undefined;
  private robotParts = -1;
  private robotSlotNow = -1;
  /** The mist clears along the top row as far as the sun has come, and along the bottom row as far as the robot. */
  private clearBand!: Phaser.GameObjects.Graphics;
  private sunSlotNow = -1;
  /** The end of the game: the board revealed, the robots arriving. Started once, when the game is over. */
  private finaleStarted = false;
  private finaleActive_ = false;
  private fadeGround = false;
  /** After the finale, a portal on a hex beside the explorer: the one last move, the exit. */
  private portalHex: HexState | undefined;
  private portal: Phaser.GameObjects.Graphics | undefined;
  private readonly overAtStart: boolean;
  /** The day's clock as drawn: it runs after the steps, so the sun crosses the sky instead of jumping. */
  private clock = -1;
  private clockTarget = -1;
  private sunGhost: Phaser.GameObjects.Image | undefined;
  /** The terrain next to the explorer with relief: mountains lifted, water dropped. */
  private relief = new Map<string, { image: Phaser.GameObjects.Image; offset: number; flat: boolean }>();
  private reliefFaces!: Phaser.GameObjects.Graphics;
  /** True after a key press until the pointer moves: only then is the preview of the faced hex shown. */
  private keyboard = false;
  /** The night between two days: progress 0 to 1 while it plays, -1 otherwise. Input waits for it, except undo. */
  private nightT = -1;
  private nightClock0 = 0;
  private nightReturned = false;
  private nightTween: Phaser.Tweens.Tween | undefined;
  private dayEndsSeen = 0;
  private undoneSeen = 0;

  /** Canvas pixels per lattice cell: the chosen pixel size times the display's pixel density. */
  private readonly k: number;

  constructor(
    private readonly state: GameState,
    pixel = DEFAULT_PIXEL,
    dpr = 1,
    private readonly onChange: (state: GameState) => void = () => {},
    /** True while something (the splash) has the keyboard and the pointer. */
    private readonly blocked: () => boolean = () => false,
    /** Called when the finale has played out, so the splash can say how it went. */
    private readonly onFinaleEnd: () => void = () => {},
  ) {
    super("map");
    this.k = pixel * dpr;
    this.overAtStart = state.over;
  }

  /** Is the finale playing? */
  get finaleActive(): boolean {
    return this.finaleActive_;
  }

  create(): void {
    this.cameras.main.setBackgroundColor("#002b43");
    this.paintEmptyBoard();
    this.makeRobotTextures();
    this.time.addEvent({
      delay: 1100,
      loop: true,
      callback: () => {
        this.cloudDrift += 5;
        this.paintClouds();
      },
    });
    this.vector = this.add.graphics().setScale(this.k).setDepth(LAYER.vector);
    // Beneath every terrain: a sinking shore must pass under pixel-art and vector neighbours alike.
    this.reliefFaces = this.add.graphics().setScale(this.k).setDepth(LAYER.board + 0.1);
    this.thread = this.add.graphics().setScale(this.k).setDepth(LAYER.graph);
    this.bankThread = this.add.graphics().setScale(this.k).setDepth(LAYER.graph + 0.3);
    this.clearBand = this.add.graphics().setScale(this.k).setDepth(LAYER.clouds + 0.02);
    this.signs = this.add.graphics().setScale(this.k).setDepth(LAYER.clouds + 0.05); // above the mist, so a signpost reads over unknown ground
    this.overlay = this.add.graphics().setScale(this.k).setDepth(LAYER.overlay);
    this.sky = this.add.graphics().setScale(this.k).setDepth(LAYER.sky);
    addGameSprite(this, "explorer", "explorer");
    addGameSprite(this, "flag", "flag");
    this.explorer = this.add.image(0, 0, "explorer").setOrigin(0).setScale(this.k).setDepth(LAYER.sprites + 0.2).setVisible(false);
    this.ghost = this.add.image(0, 0, "explorer").setOrigin(0).setScale(this.k).setDepth(LAYER.overlay).setAlpha(0.5).setVisible(false);
    for (let i = 0; i < START_MARKERS; i++)
      this.pile.push(this.add.image(0, 0, "flag").setOrigin(0).setScale(this.k).setDepth(LAYER.sprites).setVisible(false));

    // One texture pixel per board cell, like the terrain: the large sun is pixel art, not a smooth vector disc.
    const sunTexture = this.textures.createCanvas("sun", 16, 17);
    if (!sunTexture) throw new Error('could not create texture "sun"');
    this.sunTexture = sunTexture;
    this.sunTexture.setFilter(Phaser.Textures.FilterMode.NEAREST);
    this.sun = this.add.image(0, 0, "sun").setScale(this.k).setDepth(LAYER.sun);
    // the crescent that previews a move ending the day, drawn once
    const moonTexture = this.textures.createCanvas("moon", 16, 17);
    if (!moonTexture) throw new Error('could not create texture "moon"');
    moonTexture.setFilter(Phaser.Textures.FilterMode.NEAREST);
    this.paintSun(0xc7dcf0, 0xc7dcf0, 0, 1, moonTexture);
    this.sunGhost = this.add.image(0, 0, "sun").setScale(this.k).setDepth(LAYER.sun - 0.1).setAlpha(0.4).setVisible(false);

    // keys, as in a space shooter: left and right turn (a sixth of a turn each), up acts on the hex ahead and down
    // on the hex behind; shift steps instead of extending; backspace or cmd-Z undoes the last action
    const kb = this.input.keyboard;
    kb?.addCapture("LEFT,RIGHT,UP,DOWN,BACKSPACE,SPACE"); // keep the page from scrolling
    const key = (name: string, run: (e: KeyboardEvent) => void) =>
      kb?.on(`keydown-${name}`, (e: KeyboardEvent) => {
        if (this.blocked()) return;
        if (this.nightT >= 0 && name !== "BACKSPACE" && name !== "Z") return; // the night is not interrupted
        this.keyboard = true;
        run(e);
        this.drawOverlay();
      });
    key("LEFT", () => this.state.turn(-1));
    key("RIGHT", () => this.state.turn(1));
    key("UP", (e) => this.moveOrExit(false, e.shiftKey));
    key("DOWN", (e) => this.moveOrExit(true, e.shiftKey));
    key("BACKSPACE", () => void this.state.undo());
    key("Z", (e) => {
      if (e.metaKey || e.ctrlKey) {
        e.preventDefault();
        void this.state.undo();
      }
    });
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
      if (t && this.portalHex && t.id === this.portalHex.id && !this.blocked()) this.takePortal();
      else if (t && this.nightT < 0 && !this.blocked()) void this.state.click(t.id, { step: p.event.shiftKey });
    });
  }

  override update(): void {
    // the frame loop reads the cache only; it redraws when something changed
    if (this.undoneSeen !== this.state.undone) {
      this.undoneSeen = this.state.undone;
      this.dayEndsSeen = this.state.dayEnds; // a day taken back has no night to play
      this.finishNight();
    } else if (this.dayEndsSeen !== this.state.dayEnds) {
      this.dayEndsSeen = this.state.dayEnds;
      this.startNight();
    }
    if (this.state.over && !this.finaleStarted && this.nightT < 0) this.startFinale();
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
        continue; // the empty board shows through: layer one is drawn once
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
      this.ground = this.add.image(0, 0, "ground").setOrigin(0, 0).setScale(this.k).setDepth(LAYER.terrain);
      if (this.fadeGround) {
        this.fadeGround = false; // the revealed land comes up out of the fog
        this.ground.setAlpha(0);
        this.tweens.add({ targets: this.ground, alpha: 1, duration: 700 });
      }
    }
    this.drawThread();
    this.syncSprites();
    this.syncRobot();
    this.drawSignposts();
    this.paintClouds();
    this.drawClearBands();
    this.drawOverlay();
    this.startDusk();
    this.drawSky();
  }

  /**
   * The fog, on the sky layer: grey clouds over every hex the explorer does not know, in flat greys with the design
   * system's checker dither (see clouds.ts). Where the cloud thins, the dithered empty board shows through. The
   * day's forgotten ground fades out above the clouds, so the weather seems to settle over it.
   */
  private paintClouds(): void {
    const hidden = [...this.state.tiles.values()].filter((t) => t.state === "hidden");
    const key = `${this.cloudDrift}:${hidden.map((t) => t.id).join("|")}`;
    if (key === this.cloudKey) return;
    this.cloudKey = key;
    const { width, height } = boardSizePx(1);
    const texture = this.textures.exists("clouds") ? (this.textures.get("clouds") as Phaser.Textures.CanvasTexture) : this.textures.createCanvas("clouds", width, height);
    if (!texture) throw new Error('could not create texture "clouds"');
    const ctx = texture.getContext();
    ctx.clearRect(0, 0, width, height);
    // The cloud keeps the board's own checker (same cells, same two tones) and lifts both a little towards grey, so
    // it is the same dither, lighter: subtle weather, not a second pattern.
    const grey = colourNumber("light-gray");
    const lift: Record<string, number> = { wisp: 0.1, shade: 0.1, dither: 0.2, body: 0.2 };
    const tone = (even: boolean, kind: string) =>
      `#${mix(even ? MapScene.BOARD_LIGHT : MapScene.BOARD_DARK, grey, lift[kind]!).toString(16).padStart(6, "0")}`;
    for (const t of hidden) {
      const [ox, oy] = tileOrigin(t.col, t.row);
      // one density per hex, so a cloud is a cluster of whole hexes and its edges follow the hex borders
      const [cx, cy] = tileCentre(t.col, t.row);
      const density = cloudDensity(cx - this.cloudDrift, cy); // the weather drifts across the board
      for (let y = 0; y < 17; y++) {
        const w = hexSpan(y);
        for (let x = (16 - w) / 2; x < (16 + w) / 2; x++) {
          const px = ox + x;
          const py = oy + y;
          const kind = cloudCell(density, (px + py) % 2 === 0);
          if (kind === "none") continue;
          ctx.fillStyle = tone((px + py) % 2 === 0, kind);
          ctx.fillRect(px, py, 1, 1);
        }
      }
    }
    texture.refresh();
    texture.setFilter(Phaser.Textures.FilterMode.NEAREST);
    this.clouds ??= this.add.image(0, 0, "clouds").setOrigin(0).setScale(this.k).setDepth(LAYER.clouds).setAlpha(0.8);
  }

  /**
   * Layer one, the empty board: every hex position dithered in two near-black blues, in the design system's checker
   * (one cell per square, on the board's own grid so neighbouring hexes meet without a seam). Everything the explorer
   * knows is drawn over it; what it does not know is left as this.
   */
  private paintEmptyBoard(): void {
    const { width, height } = boardSizePx(1);
    const texture = this.textures.createCanvas("board", width, height);
    if (!texture) throw new Error('could not create texture "board"');
    const ctx = texture.getContext();
    const light = `#${MapScene.BOARD_LIGHT.toString(16).padStart(6, "0")}`;
    const dark = `#${MapScene.BOARD_DARK.toString(16).padStart(6, "0")}`;
    for (const [col, row] of Array.from({ length: ROWS }, (_, r) => Array.from({ length: COLS }, (_, c) => [c, r] as const)).flat()) {
      const [ox, oy] = tileOrigin(col, row);
      for (let y = 0; y < 17; y++) {
        const w = hexSpan(y);
        for (let x = (16 - w) / 2; x < (16 + w) / 2; x++) {
          ctx.fillStyle = (ox + x + oy + y) % 2 === 0 ? light : dark;
          ctx.fillRect(ox + x, oy + y, 1, 1);
        }
      }
    }
    texture.refresh();
    texture.setFilter(Phaser.Textures.FilterMode.NEAREST);
    this.add.image(0, 0, "board").setOrigin(0).setScale(this.k).setDepth(LAYER.board);
  }

  /**
   * The end of the game. The clouds clear and the whole board is revealed; a rogue robot walks in from beyond the edge
   * of the board to each settlement; where the settlement is joined to the camp the robot is made happy, and where it
   * is not the settlement is swept away. A game already over when the page loaded just shows the outcome.
   */
  private startFinale(): void {
    this.finaleStarted = true;
    if (this.overAtStart) {
      void this.settleOutcome(false);
      return;
    }
    this.finaleActive_ = true;
    const clouds = this.clouds;
    const reveal = () => void this.settleOutcome(true);
    if (clouds) this.tweens.add({ targets: clouds, alpha: 0, duration: 800, onComplete: reveal });
    else reveal();
  }

  private async settleOutcome(animate: boolean): Promise<void> {
    this.fadeGround = animate;
    await this.state.revealAll();
    const settlements = await this.state.settlements();
    if (!animate) {
      this.sweepAndBurn(settlements.filter((x) => !x.joined).map((x) => x.id));
      return;
    }
    this.time.delayedCall(1000, () => this.sendRobots(settlements));
  }

  /** Move as the keys say; while the portal waits, the only move is into it. */
  private moveOrExit(behind: boolean, step: boolean): void {
    if (this.portalHex) {
      if (this.state.faced(behind)?.id === this.portalHex.id) this.takePortal();
      return;
    }
    void this.state.go(behind, { step });
  }

  /**
   * The portal: a hex beside the explorer (the one faced if it is land, else the first land hex round), with a swirl in
   * the robot's colours. The explorer is turned to face it. It waits as long as the player likes.
   */
  private openPortal(): void {
    const here = this.state.here();
    if (!here) {
      this.finaleActive_ = false;
      this.onFinaleEnd();
      return;
    }
    const land = (t: HexState | undefined): t is HexState => !!t && t.terrain !== "water" && t.terrain !== "deep" && !t.feature;
    const faced = this.state.faced();
    const sides = SIDES_CLOCKWISE.map((side) => {
      const n = neighbourAt(here, side);
      return this.state.tileAt(n.col, n.row);
    });
    const target = land(faced) ? faced : sides.find(land) ?? sides.find((t) => !!t);
    if (!target) {
      this.finaleActive_ = false;
      this.onFinaleEnd();
      return;
    }
    this.portalHex = target;
    this.state.facing = sideTo(here, target);
    const [cx, cy] = tileCentre(target.col, target.row);
    const g = this.add.graphics().setPosition(cx * this.k, cy * this.k).setScale(0).setDepth(LAYER.sprites + 0.3);
    this.portal = g;
    const colour = (hex: string) => parseInt(hex.slice(1), 16);
    const ring = [colour(ROBOT_COLOURS["Y"]!), colour(ROBOT_COLOURS["c"]!), colour(ROBOT_COLOURS["C"]!)];
    const spin = { phase: 0 };
    this.tweens.add({ targets: g, scale: this.k, duration: 700, ease: "Back.easeOut" });
    this.tweens.add({
      targets: spin,
      phase: Math.PI * 2,
      duration: 2400,
      repeat: -1,
      onUpdate: () => {
        g.clear();
        g.fillStyle(0x181414, 0.85);
        g.fillCircle(0, 0, 7.2);
        for (let i = 0; i < 3; i++) {
          const dir = i % 2 === 0 ? 1 : -1;
          g.lineStyle(1.4, ring[i]!, 1);
          g.beginPath();
          g.arc(0, 0, 6.4 - i * 1.9, dir * spin.phase * (1 + i * 0.4) + i * 1.7, dir * spin.phase * (1 + i * 0.4) + i * 1.7 + 4.4);
          g.strokePath();
        }
        g.fillStyle(ring[2]!, 1);
        g.fillCircle(0, 0, 1);
      },
    });
    this.drawOverlay();
  }

  /** The last move: the explorer steps into the portal and is gone, and the splash tells how it went. */
  private takePortal(): void {
    const target = this.portalHex;
    const explorer = this.explorer;
    if (!target || !explorer) return;
    this.portalHex = undefined; // once
    const [x, y] = this.spotOf(target.col, target.row);
    const [px, py] = [x + explorer.displayWidth / 2, y + explorer.displayHeight / 2];
    this.tweens.add({ targets: explorer, x, y, duration: 260, ease: "Sine.easeIn" });
    this.tweens.add({
      targets: explorer,
      scale: 0,
      alpha: 0,
      angle: 360,
      delay: 260,
      duration: 520,
      ease: "Quad.easeIn",
      onUpdate: () => explorer.setOrigin(0.5).setPosition(px, py),
      onComplete: () => {
        this.portal?.destroy();
        this.portal = undefined;
        this.finaleActive_ = false;
        this.onFinaleEnd();
      },
    });
  }

  /** The settlements that were not saved stand no more: bare ground, and a fire. */
  private sweepAndBurn(ids: string[]): void {
    this.state.sweepAway(ids);
    addSpriteTexture(this, "fire", "fire");
    this.textures.get("fire").setFilter(Phaser.Textures.FilterMode.NEAREST);
    for (const id of ids) {
      const t = this.state.tiles.get(id);
      if (!t) continue;
      const [x, y] = this.spotOf(t.col, t.row);
      const fire = this.add.image(x, y, "fire").setOrigin(0).setScale(this.k).setDepth(LAYER.sprites + 0.2);
      this.tweens.add({ targets: fire, scaleY: this.k * 0.88, y: y + 1.5 * this.k, duration: 260, yoyo: true, repeat: -1 });
    }
  }

  private sendRobots(settlements: { id: string; joined: boolean }[]): void {
    const tiles = this.state.tiles;
    const camp = [...tiles.values()].find((t) => t.feature === "tent");
    const [cx, cy] = camp ? tileCentre(camp.col, camp.row) : [0, 0];
    const board = boardSizePx(1);
    addSpriteTexture(this, "heart", "heart");
    this.textures.get("heart").setFilter(Phaser.Textures.FilterMode.NEAREST);
    let done = 0;
    const arrived = () => {
      if (++done < settlements.length) return;
      // the scene is left to be enjoyed; then a portal opens beside the explorer, and stepping into it ends the game
      this.time.delayedCall(1800, () => this.openPortal());
    };
    if (!settlements.length) return arrived();
    settlements.forEach((s, i) => {
      const t = tiles.get(s.id);
      if (!t) return arrived();
      const [tx, ty] = tileCentre(t.col, t.row);
      let dx = tx - cx;
      let dy = ty - cy;
      const len = Math.hypot(dx, dy) || 1;
      dx /= len;
      dy /= len;
      // in from beyond the settlement's side of the board: so each robot's nearest settlement is its own
      let sx = tx;
      let sy = ty;
      while (sx > 0 && sx < board.width && sy > 0 && sy < board.height) {
        sx += dx * 4;
        sy += dy * 4;
      }
      sx = Math.max(8, Math.min(board.width - 8, sx));
      sy = Math.max(8, Math.min(board.height - 8, sy));
      const away = Math.hypot(sx - tx, sy - ty) || 1;
      const stopX = tx + ((sx - tx) / away) * 11;
      const stopY = ty + ((sy - ty) / away) * 11;
      const robot = this.add.image(sx * this.k, sy * this.k, "robot-7").setScale(this.k).setDepth(LAYER.sprites + 0.4).setAlpha(0);
      const delay = i * 280;
      this.tweens.add({ targets: robot, alpha: 1, duration: 300, delay });
      this.tweens.add({
        targets: robot,
        x: stopX * this.k,
        y: stopY * this.k,
        duration: 2200,
        delay,
        ease: "Sine.easeInOut",
        onComplete: () => {
          if (s.joined) {
            // the settlement is joined to the camp: the robot is made happy
            const heart = this.add.image(robot.x, robot.y - 10 * this.k, "heart").setScale(this.k).setDepth(LAYER.sprites + 0.5);
            this.tweens.add({ targets: heart, y: heart.y - 8 * this.k, alpha: 0, duration: 1400, ease: "Quad.easeOut", onComplete: () => heart.destroy() });
          } else {
            // isolated: it is swept away
            robot.setTint(0xff6b3d);
            this.cameras.main.shake(260, 0.004);
            this.sweepAndBurn([s.id]);
          }
          arrived();
        },
      });
    });
  }

  /** The robot as 8 textures (0 to 7 parts), and one of its whole outline for the faint plan of it. */
  private makeRobotTextures(): void {
    const paint = (key: string, cells: ReturnType<typeof robotCells>, colour?: string) => {
      const texture = this.textures.createCanvas(key, 16, 16);
      if (!texture) throw new Error(`could not create texture "${key}"`);
      const ctx = texture.getContext();
      for (const [x, y, ch] of cells) {
        const name = colour ?? (ch === "K" ? "black" : spritesAsset.palette[ch]);
        ctx.fillStyle = colour ? paletteAsset.colours[colour]! : (ROBOT_COLOURS[ch] ?? paletteAsset.colours[name!]!);
        ctx.fillRect(x, y, 1, 1);
      }
      texture.refresh();
      texture.setFilter(Phaser.Textures.FilterMode.NEAREST);
    };
    for (let n = 0; n <= DAYS; n++) paint(`robot-${n}`, robotCells(n));
    paint("robot-ghost", robotCells(DAYS), "light-gray");
    this.robotGhost = this.add.image(0, 0, "robot-ghost").setOrigin(0).setScale(this.k).setDepth(LAYER.sun - 0.6).setAlpha(0.14);
    this.robot = this.add.image(0, 0, "robot-0").setOrigin(0).setScale(this.k).setDepth(LAYER.sun - 0.5);
  }

  /**
   * The robot being built along the bottom row (the day counter, which is the robot's parts in the graph): one more
   * part a night, and an even hop to the right each day. Until midnight of a night it still shows the day that ended;
   * then it steps to its new place and the new part appears.
   */
  private syncRobot(): void {
    const robot = this.robot;
    const ghost = this.robotGhost;
    if (!robot || !ghost) return;
    const total = this.state.parts.length;
    const parts = this.nightT >= 0 && !this.nightReturned ? Math.max(0, total - 1) : total;
    const slot = robotSlot(Math.min(DAYS, parts + 1), COLS);
    const [x, y] = this.spotOf(slot, ROWS - 1);
    if (this.robotParts === parts && this.robotSlotNow === slot) return;
    const first = this.robotParts < 0;
    const grew = parts > this.robotParts && !first;
    this.robotParts = parts;
    this.robotSlotNow = slot;
    this.drawClearBands();
    robot.setTexture(`robot-${parts}`);
    ghost.setPosition(x, y);
    this.tweens.killTweensOf(robot);
    if (first) robot.setPosition(x, y);
    else this.tweens.add({ targets: robot, x, y, duration: 500, ease: "Sine.easeInOut" });
    if (grew) {
      robot.setAlpha(0.2);
      this.tweens.add({ targets: robot, alpha: 1, duration: 700, ease: "Quad.easeOut" }); // the new part switches on
    } else robot.setAlpha(1);
  }

  /**
   * The sun and the robot are clocks, and each clears the mist as it progresses: the top row from the left edge to the
   * sun, wherever it is now, and the bottom row from the left edge to the robot. Cleared hexes show the open sky.
   */
  private drawClearBands(): void {
    const g = this.clearBand;
    if (!g) return;
    g.clear();
    const sky = "dark-baltic";
    const clear = (row: number, upTo: number) => {
      for (let col = 0; col <= upTo && col < COLS; col++) {
        const t = this.state.tileAt(col, row);
        if (t && t.state === "hidden") fillHex(g, col, row, sky);
      }
    };
    if (this.sunSlotNow >= 0) clear(0, this.sunSlotNow);
    if (this.robotSlotNow >= 0) clear(ROWS - 1, this.robotSlotNow);
  }

  /** Where a sprite's corner goes so that it stands on a tile: the explorer's 16 by 16 sits in the tile's 16 by 17. */
  private spotOf(col: number, row: number): [number, number] {
    const [ox, oy] = tileOrigin(col, row);
    return [ox * this.k, (oy + 0.5) * this.k];
  }

  /**
   * Layer five, the sprites: the explorer, the waymarkers standing where they were placed, and the ones still in the
   * bag, piled round the camp. (The camp and the towers are the terrain's own pixel art.)
   */
  private syncSprites(): void {
    const tiles = this.state.tiles;
    const here = this.state.here();
    const home = this.nightT < 0 || this.nightReturned; // the explorer stays out until midnight
    if (here && this.explorer && home) {
      const [x, y] = this.spotOf(here.col, here.row);
      if (!this.explorer.visible) this.explorer.setPosition(x, y).setVisible(true);
      else if (this.explorerAt !== here.id) {
        this.tweens.killTweensOf(this.explorer);
        this.tweens.add({ targets: this.explorer, x, y, duration: 140, ease: "Sine.easeOut" });
      }
      this.explorerAt = here.id;
    }
    // waymarkers standing on the board: an anchor that is neither the camp nor a tower
    const standing = new Set<string>();
    for (const t of tiles.values())
      if (t.anchor && !t.feature && t.state !== "hidden") standing.add(t.id);
    for (const [id, image] of this.flags)
      if (!standing.has(id)) {
        image.destroy();
        this.flags.delete(id);
      }
    for (const id of standing) {
      if (this.flags.has(id) || this.flying.has(id)) continue;
      const t = tiles.get(id)!;
      const [x, y] = this.spotOf(t.col, t.row);
      this.flags.set(id, this.add.image(x + STAND[0] * this.k, y + STAND[1] * this.k, "flag").setOrigin(0).setScale(this.k).setDepth(LAYER.sprites + 0.3));
    }
    // the bag, round the camp
    const camp = [...tiles.values()].find((t) => t.state !== "hidden" && t.feature === "tent");
    this.pile.forEach((image, i) => {
      image.setVisible(Boolean(camp) && i < this.state.player.markers);
      if (camp) {
        const [x, y] = this.spotOf(camp.col, camp.row);
        image.setPosition(x + PILE[i]![0] * this.k, y + PILE[i]![1] * this.k);
      }
    });
  }

  /** A waymarker leaves the pile and travels to the hex it marks. */
  private flyFlag(slot: number, waymark: string): void {
    const target = this.state.tiles.get(waymark);
    const from = this.pile[slot];
    if (!target || !from) return;
    const [x0, y0] = this.spotOf(target.col, target.row);
    const [x, y] = [x0 + STAND[0] * this.k, y0 + STAND[1] * this.k];
    this.flying.add(waymark);
    const flyer = this.add.image(from.x, from.y, "flag").setOrigin(0).setScale(this.k).setDepth(LAYER.sprites + 0.3);
    this.tweens.add({
      targets: flyer,
      x,
      y,
      duration: 420,
      ease: "Sine.easeInOut",
      onComplete: () => {
        flyer.destroy();
        this.flying.delete(waymark);
        this.syncSprites();
      },
    });
  }

  /**
   * Settle the day's fog: each forgotten hex keeps its remembered look while the dusk deepens, then fades away in
   * rings from the abandoned thread outward. Secured ground and its disclosed edges were never in the answer.
   */
  private startDusk(): void {
    const ghosts: DuskHex[] = this.state.lastFogged;
    this.state.lastFogged = []; // consumed once; a later redraw shows only the settled board
    if (!ghosts.length) return;
    const version = this.state.version;
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
      const image = this.add.image(ox * this.k, oy * this.k, key).setOrigin(0).setScale(this.k).setDepth(LAYER.clouds + 0.05);
      this.tweens.add({
        targets: image,
        alpha: 0,
        delay: NIGHT_MS * 0.26 + ghost.ring * 90, // the ground is forgotten as night falls
        duration: 420,
        ease: "Quad.easeOut",
        onComplete: () => {
          image.destroy();
          if (this.textures.exists(key)) this.textures.remove(key);
        },
      });
    }
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
        const depth = t.terrain === "mountain" ? LAYER.terrain + 0.5 : LAYER.board + 0.2;
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
   * pale at noon and an ember towards dusk, while the whole world's light cools underneath it. At dusk the day is over,
   * and the night plays (see `startNight`).
   */
  private drawSky(): void {
    const sky = this.sky;
    if (!sky) return;
    sky.clear();
    const target = Math.max(0, Math.min(1, 1 - this.state.player.steps / START_STEPS)); // 0 dawn, 1 dusk
    let f: number;
    let slot: number;
    let moon = 0;
    let darkness = 0;
    if (this.nightT >= 0) {
      ({ clock: f, slot, moon, darkness } = this.nightSky(this.nightT));
    } else {
      if (this.clock < 0) this.clock = this.clockTarget = target;
      if (target !== this.clockTarget) {
        // the sun runs after the steps: spent steps are time passing, so it crosses the sky rather than jumping
        this.clockTarget = target;
        this.tweens.killTweensOf(this);
        this.tweens.add({
          targets: this,
          clock: target,
          duration: Math.min(900, 220 + 700 * Math.abs(target - this.clock)),
          ease: "Sine.easeInOut",
          onUpdate: () => this.drawSky(),
        });
      }
      f = this.clock;
      // A straight, grid-aligned crossing: dawn at the leftmost centre, noon at the middle, dusk at the right.
      slot = Math.round(f * (COLS - 1));
    }
    if (slot !== this.sunSlotNow) {
      this.sunSlotNow = slot;
      this.drawClearBands();
    }
    const [x, y] = tileCentre(slot, 0);
    const body = f < 0.5 ? mix(0xffb45f, 0xfff4c8, 2 * f) : mix(0xfff4c8, 0xff6b3d, 2 * (f - 0.5));
    const noon = Math.sin(Math.PI * f);
    this.paintSun(mix(body, 0xc7dcf0, moon), mix(body, 0xffffee, 0.18 + 0.3 * noon), noon, moon);
    this.sun?.setPosition(x * this.k, y * this.k);
    // The light cools as the day drains; at night it falls to its deepest and comes back by morning.
    sky.fillStyle(0x07152b, Math.min(0.82, Math.max(0.3 * f * f, 0.82 * darkness)));
    const board = boardSizePx(1);
    sky.fillRect(0, 0, board.width, board.height); // the whole board, to its outermost hex edges
  }

  /**
   * The sky at a moment of the night (0 to 1): the sun runs on to the right (if the day was ended early), turns into
   * a crescent moon, and the sky darkens as the moon crosses from right to left; at midnight (the moon on the left,
   * the explorer home) the sky begins to lighten, and by morning the moon has turned back into the sun.
   */
  private nightSky(t: number): { clock: number; slot: number; moon: number; darkness: number } {
    const clamp = (x: number) => Math.max(0, Math.min(1, x));
    const ease = (x: number) => x * x * (3 - 2 * x);
    const last = COLS - 1;
    if (t < 0.14) {
      const clock = this.nightClock0 + (1 - this.nightClock0) * ease(t / 0.14);
      return { clock, slot: Math.round(clock * last), moon: 0, darkness: 0 };
    }
    if (t < MIDNIGHT) {
      const crossing = ease(clamp((t - 0.26) / (MIDNIGHT - 0.26)));
      return {
        clock: 1,
        slot: Math.round((1 - crossing) * last),
        moon: ease(clamp((t - 0.14) / 0.12)),
        darkness: ease(clamp((t - 0.26) / 0.22)),
      };
    }
    return { clock: 0, slot: 0, moon: 1 - ease(clamp((t - 0.84) / 0.16)), darkness: 1 - ease(clamp((t - 0.6) / 0.28)) };
  }

  /** Play the night: the day just ended. The graph is already on the new day; this is the sky and the sun only. */
  private startNight(): void {
    this.nightTween?.stop();
    this.tweens.killTweensOf(this);
    this.nightClock0 = this.clock < 0 ? 0 : this.clock;
    this.nightReturned = false;
    this.nightT = 0;
    this.nightTween = this.tweens.addCounter({
      from: 0,
      to: 1,
      duration: NIGHT_MS,
      onUpdate: (_tween, _target, _key, current) => {
        this.nightT = current;
        if (!this.nightReturned && current >= MIDNIGHT) {
          this.nightReturned = true;
          this.syncSprites(); // midnight: the explorer is home
          this.syncRobot(); // and the robot grows a part
        }
        this.drawSky();
      },
      onComplete: () => this.finishNight(),
    });
  }

  /** End the night, now or by undo: the sky goes back to reading the steps. */
  private finishNight(): void {
    if (this.nightT < 0) return;
    this.nightTween?.stop();
    this.nightTween = undefined;
    this.nightT = -1;
    this.nightReturned = true;
    this.syncRobot();
    this.clock = this.clockTarget = Math.max(0, Math.min(1, 1 - this.state.player.steps / START_STEPS));
    this.syncSprites();
    this.drawSky();
  }

  /**
   * Paint whole texture pixels, exactly like a terrain sprite; the disc and its rays have no antialiased edges. `moon`
   * (0 to 1) turns the sun into a crescent: the rays fade and a second disc bites into the first from the right.
   */
  private paintSun(body: number, ray: number, noon: number, moon = 0, texture = this.sunTexture): void {
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
    // Rasterized one-pixel rays: longer and more opaque at noon, short and subdued at the horizons; none on the moon.
    for (let i = 0; i < 12; i++) {
      const angle = (i * Math.PI) / 6;
      const inner = radius + 0.3;
      const outer = radius + 0.55 + 1.5 * noon + (i % 2 === 0 ? 0.25 : 0);
      line(
        x + Math.cos(angle) * inner,
        y + Math.sin(angle) * inner,
        x + Math.cos(angle) * outer,
        y + Math.sin(angle) * outer,
        Math.round(255 * (0.4 + 0.6 * noon) * (1 - moon)),
      );
    }
    // Three flat tones give the disc a lit edge and a shaded edge, without gradients or smooth drawing primitives.
    const highlight = mix(body, 0xffffee, 0.55);
    const shade = mix(body, 0x783b36, 0.22);
    // the bite: a disc that starts far to the right (no bite) and comes in to leave a crescent lit on the left
    const reach = 13 * (1 - moon) + 3.4 * moon;
    const biteX = x + reach;
    const biteY = y - reach * 0.35;
    const biteR = 5.2;
    for (let py = 0; py < 17; py++) {
      for (let px = 0; px < 16; px++) {
        const dx = px - x;
        const dy = py - y;
        if (dx * dx + dy * dy > radius * radius) continue;
        if (moon > 0 && (px - biteX) ** 2 + (py - biteY) ** 2 < biteR * biteR) continue;
        pixel(px, py, dx + dy < -2 ? highlight : dx + dy > 4 && moon < 1 ? shade : body);
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
    this.flyFlag(this.state.player.markers, banked.waymark); // the slot the placed waymarker left
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
    const oldParts = this.routeParts(oldRoute, tiles, 0);
    const securedParts = this.routeParts(securedRoute, tiles, 1);
    nodes.push(...oldParts.nodes, ...securedParts.nodes);
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
  }

  /** The empty board's two dither tones: a neutral mist, with no hue at all, so it is never taken for water or rock. */
  private static readonly BOARD_LIGHT = mixColour("dark-gray", "light-gray", 0.6);
  private static readonly BOARD_DARK = mixColour("dark-gray", "light-gray", 0.52);

  /**
   * Signposts: from each settlement the explorer has arrived at (and the camp), an arrowhead beside the hex for each of
   * the six directions in which an unreached settlement lies within a day's walk. They say which way, not how far.
   */
  private drawSignposts(): void {
    const g = this.signs;
    g.clear();
    if (this.state.over) return;
    const SIDE_ANGLE: Record<string, number> = { e: 0, se: 60, sw: 120, w: 180, nw: 240, ne: 300 };
    for (const [id, sides] of this.state.signposts) {
      const t = this.state.tiles.get(id);
      if (!t || t.state === "hidden") continue;
      const [cx, cy] = tileCentre(t.col, t.row);
      for (const side of sides) {
        const a = (SIDE_ANGLE[side]! * Math.PI) / 180;
        // a detached arrowhead, the design system's chevron, just outside the hex and pointing away from it
        const tx = cx + Math.cos(a) * 12.4;
        const ty = cy + Math.sin(a) * 12.4;
        const arm = (turn: number) =>
          new Phaser.Math.Vector2(tx - Math.cos(a + turn) * 3.4, ty - Math.sin(a + turn) * 3.4);
        const chevron = [arm(0.62), new Phaser.Math.Vector2(tx, ty), arm(-0.62)];
        for (const [width, colour] of [[2.1, "cream"], [1, "black"]] as const) {
          g.lineStyle(width, colourNumber(colour), 1);
          g.strokePoints(chevron, false);
        }
      }
    }
  }


  /** Where a path's end-cap stands: against the edge of the tile (the apothem of the 16 wide hexagon). */
  private static readonly CAP_R = 7.5;
  /**
   * Where a loose path's bar stands: its cream outline ends one cell inside the tile's edge, so six bars meeting in a
   * tile make a tighter inner hexagon (apothem 6, side 6.93) than the tile itself.
   */
  private static readonly BAR_R = 6;

  /**
   * A route as graph parts whose lines run to the cap: a node as wide as the tile stands in for each anchor the
   * route leaves from or arrives at, so a secured line starts at the edge of the tile and a spoke is not needed.
   */
  private routeParts(r: Route, tiles: ReadonlyMap<string, HexState>, index: number) {
    const size = r.kind === "LOOSE" ? MapScene.BAR_R * 2 - 2 : MapScene.CAP_R * 2 - 2;
    const route = routeToGraph(r, tiles, size);
    const nodes: GraphNode[] = [];
    const swap = (end: GraphEdge["from"], id: string, which: string): GraphEdge["from"] => {
      if (end !== id) return end;
      const t = tiles.get(id)!;
      const cap = `cap:${index}:${which}`;
      nodes.push({ id: cap, col: t.col, row: t.row, size });
      return cap;
    };
    const edges = route.edges.map((e) => ({ ...e, from: swap(e.from, r.from, "from"), to: swap(e.to, r.to, "to") }));
    return { ...route, edges, nodes };
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
    found.forEach((r, i) => {
      if (this.bank && r.kind === "SECURED" && `${r.from}>${r.to}` === this.bank.key) return; // the transition draws this one
      const route = this.routeParts(r, tiles, i);
      nodes.push(...route.nodes);
      pieces.push(...route.pieces);
      edges.push(...route.edges);
      waves.push(...route.waves);
    });
    // the routes only; the markers are rings, drawn after
    const placed = layoutGraph(nodes, edges, {}, withCrossings(pieces));
    placed.pieces.push(...waves.map((w) => placeWave(w)));
    // The end-caps belong to their lines (the design system's arrows are one shape). A secured path ends in `)` and
    // `(`; a loose path is anchored at its start by a bar as long as a side of the hexagon inside the tile, so six
    // meeting in a tile would close an inner hex, and six arcs a circle: both invite the way out. Casings go under the
    // graph and the black over it, so cap and line read as one stroke.
    const R = MapScene.CAP_R;
    const side = (2 * MapScene.BAR_R) / Math.sqrt(3);
    const capStrokes: ((width: number, colour: "cream" | "black") => void)[] = [];
    const cap = (anchor: string, towards: string, kind: "arc" | "bar") => {
      const a0 = tiles.get(anchor);
      const a1 = tiles.get(towards);
      if (!a0 || !a1) return;
      const [cx, cy] = tileCentre(a0.col, a0.row);
      const [tx, ty] = tileCentre(a1.col, a1.row);
      const angle = Math.atan2(ty - cy, tx - cx);
      capStrokes.push((width, colour) => {
        g.lineStyle(width, colourNumber(colour), 1);
        if (kind === "arc") {
          g.beginPath();
          g.arc(cx, cy, R, angle - 0.5, angle + 0.5);
          g.strokePath();
        } else {
          const px = cx + Math.cos(angle) * MapScene.BAR_R;
          const py = cy + Math.sin(angle) * MapScene.BAR_R;
          const nx = -Math.sin(angle) * (side / 2);
          const ny = Math.cos(angle) * (side / 2);
          g.lineBetween(px - nx, py - ny, px + nx, py + ny);
        }
      });
    };
    for (const r of found) {
      const first = r.between[0] ?? r.to;
      const last = r.between[r.between.length - 1] ?? r.from;
      if (r.kind === "SECURED") {
        cap(r.from, first, "arc");
        cap(r.to, last, "arc");
      } else cap(r.from, first, "bar");
    }
    for (const stroke of capStrokes) stroke(2.1, "cream");
    drawGraph(g, { ...placed, nodes: [] });
    for (const stroke of capStrokes) stroke(1, "black");
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
    this.drawGhosts();
  }

  /** The hex the pointer is over, or with the keyboard in use the one the explorer faces. */
  private previewTarget(): HexState | undefined {
    return this.keyboard ? this.state.faced() : this.hover;
  }

  /**
   * The faint explorer on the hex the faced move would reach (keyboard only), and the faint sun at the place in the
   * sky that move would carry the day to: the cost of a step is time. A climb the day cannot afford puts the ghost
   * beyond dusk, in the cold colour of the night.
   */
  private drawGhosts(): void {
    const ghost = this.ghost;
    const sun = this.sunGhost;
    if (!ghost || !sun) return;
    ghost.setVisible(false);
    sun.setVisible(false);
    if (this.nightT >= 0) return; // the night plays undisturbed
    const here = this.state.here();
    const t = this.previewTarget();
    if (!here || !t || t.id === here.id || this.state.pending) return;
    const i = this.state.intent(t.id);
    const steps = this.state.player.steps;
    let cost: number | undefined;
    if (i.kind === "reel" || i.kind === "travel") cost = 1;
    else if (i.kind === "extend" || i.kind === "step") cost = t.cost ?? 1;
    else if (t.terrain && t.state !== "hidden" && steps > 0 && steps < (t.cost ?? 1) && neighbours(here.col, here.row).some(([c, r]) => c === t.col && r === t.row))
      cost = t.cost ?? 1; // too steep: the day cannot pay for it
    if (cost === undefined) return;
    if (this.keyboard && i.kind !== "none" && i.kind !== "travel") {
      const [x, y] = this.spotOf(t.col, t.row);
      ghost.setPosition(x, y).setVisible(true);
    }
    const left = steps - cost;
    const f = Math.max(0, Math.min(1, 1 - left / START_STEPS));
    const [sx, sy] = tileCentre(Math.round(f * (COLS - 1)), 0);
    // a move that spends the last step (or more than the day has) reaches the night: the sun is shown as the moon it will become
    sun.setTexture(left <= 0 ? "moon" : "sun").setAlpha(left <= 0 ? 0.6 : 0.4);
    sun.setPosition(sx * this.k, sy * this.k).setVisible(true);
    if (left < 0) sun.setTint(0x6b7fa0);
    else sun.clearTint();
  }
}

export function boardSizePx(pixel = DEFAULT_PIXEL): { width: number; height: number } {
  const blank = Array.from({ length: ROWS }, () => " ".repeat(COLS));
  const s = paintScene([{ col: COLS - 1, row: ROWS - 1, terrain: "grass" }], blank);
  return { width: s.width * pixel, height: s.height * pixel };
}
