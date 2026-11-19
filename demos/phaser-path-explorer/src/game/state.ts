// The cache (ADR-011, 2.6): a plain object of the board as the player may know it, patched by replies. Rendering
// reads this and never awaits. Actions go through the bridge; an extension needs its reply to know what the new hexes
// contain, so it shows as pending until the reply arrives, and a further action waits for it.
import { neighbourAt, neighbours, oppositeSide, sideTo, turnSide, type Feature, type Side, type Terrain } from "../hex/core/index.js";
import { ReplyCache, type Bridge, type CacheClient, type Patch, type Row } from "@relate/contrib-phaser";
import {
  BRANCH_EXTEND, END_DAY, EXTEND, PLACE_FLAG, PLACE_WAYMARKER, READ_BOARD, READ_EDGES, READ_HEXES, READ_PLAYER, REEL_IN, SECURE, STEP, TRAVEL, TOWERS,
  UNDO_CLEAR_EDGES, UNDO_CLEAR_PARTS, UNDO_HEXES, UNDO_LOOSE, UNDO_PARTS, UNDO_PLAYER, UNDO_SECURED,
  GAME_OVER, MARKERS_USED, READ_PARTS, READ_SIGNPOSTS, READ_TRUTH, VIEW_AROUND,
} from "./statements.js";
import { PARTS, computeScore, type Outcome } from "./score.js";
import { groupSignposts } from "./signposts.js";
import { DAYS, START_STEPS } from "./world.js";

/**
 * What the explorer knows of a hex: hidden (nothing); sensed (its colour: where the path can go); viewed (in sight, in
 * full, features and all, but still reached by extending the path); seen (walked or remembered: it can be stepped onto);
 * path (on a path).
 */
export type Knowledge = "hidden" | "sensed" | "viewed" | "seen" | "path";

export interface HexState {
  id: string;
  col: number;
  row: number;
  state: Knowledge;
  /** Steps to enter this hex. Absent means 1 (older stores); hidden hexes give nothing away. */
  cost?: number;
  /** Absent while hidden: the client never holds the ground truth of a hex it has not discovered. */
  terrain?: Terrain;
  feature?: Feature;
  anchor?: boolean;
  /** The explorer has arrived here, and its signposts show (a settlement), or it is the camp. */
  mapped?: boolean;
}

export interface PlayerState {
  at: string;
  steps: number;
  markers: number;
  /** The game has ended: the last night has fallen, or every settlement is routed. */
  over?: boolean;
}

/** A hex the day forgot, kept only long enough for the scene to settle it into fog. */
export interface DuskHex {
  id: string;
  ring: number;
  state: Knowledge;
  terrain?: Terrain;
  feature?: Feature;
}

/** The loose path a waymarker banked, kept only long enough for the scene to pull it taut. */
export interface BankedPath {
  /** The new anchor. */
  waymark: string;
  /** The anchor the banked path started from. */
  from: string;
  /** The edges as they were loose, before the statement secured them. */
  edges: Edge[];
}

/** The thread (loose) or a path between anchors (secured), from one hex to the next. */
export interface Edge {
  from: string;
  to: string;
  kind: "LOOSE" | "SECURED";
}

function toHex(r: Row): HexState {
  const hex: HexState = { id: r["id"] as string, col: r["col"] as number, row: r["row"] as number, state: r["state"] as Knowledge };
  if (r["terrain"]) hex.terrain = r["terrain"] as Terrain;
  if (r["feature"]) hex.feature = r["feature"] as Feature;
  if (r["anchor"]) hex.anchor = true;
  if (r["mapped"]) hex.mapped = true;
  if (typeof r["cost"] === "number") hex.cost = r["cost"] as number;
  return hex;
}

/** The board as it was before the last action: what one undo puts back (ADR-011, amended). */
interface Snapshot {
  tiles: Map<string, HexState>;
  edges: Edge[];
  player: PlayerState;
  facing: Side;
  parts: string[];
}

/** What acting on a hex would do (see `GameState.intent`). */
export type Intent = { kind: "reel" | "extend" | "step" | "travel" } | { kind: "none"; reason: string };

export class GameState {
  readonly tiles = new Map<string, HexState>();
  private readonly byPos = new Map<string, string>();
  edges: Edge[] = [];
  /** Which of the six directions the explorer faces: what the arrow keys act on. Not stored in the graph. */
  facing: Side = "e";
  player: PlayerState = { at: "", steps: 0, markers: 0 };
  /** The robot's parts, one a night, in order: the days that have passed (see score.ts). */
  parts: string[] = [];
  /** The signposts: from each mapped settlement, the directions of the settlements within a day's walk not yet reached. */
  signposts = new Map<string, Side[]>();
  message = "";
  /** The hex an action is waiting on, while its reply is awaited (the cache holds it). */
  get pending(): string | null {
    return this.cache.pending;
  }
  /** Bumped on every change, so the frame loop can redraw only when something changed (the cache holds it). */
  get version(): number {
    return this.cache.version;
  }
  /** The hexes the last day end fogged, ordered outward from the abandoned thread. The scene consumes this. */
  lastFogged: DuskHex[] = [];
  /** The path the last waymarker banked. The scene consumes this to pull the loose wave taut. */
  lastBanked: BankedPath | null = null;
  private moves = 0;
  /** The state before the last action, or null when there is nothing to undo. One level only. */
  private undoSnap: Snapshot | null = null;
  /** Set by an action when its reply changed the board, so `act` knows to keep the snapshot it took. */
  private applied = false;
  /** Bumped by every undo, so the scene can tell a step back from a step forward. */
  undone = 0;
  /** Bumped when a day ends, so the scene can play the night. */
  dayEnds = 0;

  /** The mechanism: the version, the pending action and the reload after an engine replacement (ADR-012). */
  private readonly cache: ReplyCache<GameState>;
  private started = false;

  /** `client` lets the cache follow the engine: it rebuilds the board after a replacement. Without one the cache only loads when asked. */
  constructor(private readonly bridge: Bridge, client?: CacheClient) {
    this.cache = new ReplyCache<GameState>({
      client: client ?? standalone(bridge),
      bridge,
      initial: this,
      load: (b) => this.readBoard(b),
    });
  }

  private touch(): void {
    this.cache.commit(() => undefined);
  }

  private merge(rows: Row[]): void {
    for (const r of rows) {
      const hex = toHex(r);
      this.tiles.set(hex.id, hex);
      this.byPos.set(`${hex.col},${hex.row}`, hex.id);
    }
  }

  /** Fill the cache from the graph: at start, and again after the engine is replaced. */
  load(): Promise<void> {
    if (this.started) return this.cache.reload();
    this.started = true;
    return this.cache.start();
  }

  /** The reads that fill the board, and the patch that puts them in the cache in one step. */
  private async readBoard(bridge: Bridge): Promise<Patch<GameState>> {
    const [board, player, edges, parts, signs] = await Promise.all([
      bridge.enqueue(READ_BOARD),
      bridge.enqueue(READ_PLAYER),
      bridge.enqueue(READ_EDGES),
      bridge.enqueue(READ_PARTS),
      bridge.enqueue(READ_SIGNPOSTS),
    ]);
    return (s) => {
      s.signposts = groupSignposts(signs.map((r) => ({ at: r["at"] as string, dq: r["dq"] as number, dr: r["dr"] as number })));
      s.parts = parts.map((r) => r["kind"] as string);
      s.tiles.clear();
      s.byPos.clear();
      s.merge(board);
      const p = player[0];
      if (p) s.player = { at: p["at"] as string, steps: p["steps"] as number, markers: p["markers"] as number, over: p["over"] === true };
      s.edges = edges.map((e) => ({ from: e["from"] as string, to: e["to"] as string, kind: e["kind"] as Edge["kind"] }));
      s.undoSnap = null; // the graph may differ from what the snapshot recorded
    };
  }

  tileAt(col: number, row: number): HexState | undefined {
    const id = this.byPos.get(`${col},${row}`);
    return id ? this.tiles.get(id) : undefined;
  }

  /** The hex the explorer stands on. */
  here(): HexState | undefined {
    return this.tiles.get(this.player.at);
  }

  /**
   * The end of the game shows the whole board: every hex comes into the cache with its ground, as seen (a path stays a
   * path). Cache only: the graph is not touched, and the game is over.
   */
  async revealAll(): Promise<void> {
    const rows = await this.bridge.enqueue(READ_TRUTH);
    for (const r of rows) {
      const hex = toHex(r);
      if (this.tiles.get(hex.id)?.state === "path") hex.state = "path";
      else hex.state = "seen";
      this.tiles.set(hex.id, hex);
      this.byPos.set(`${hex.col},${hex.row}`, hex.id);
    }
    this.touch();
  }

  /** Settlements swept away: they stand no more (cache only, at the end of the game). */
  sweepAway(ids: string[]): void {
    for (const id of ids) {
      const t = this.tiles.get(id);
      if (!t) continue;
      delete t.feature;
      delete t.anchor;
    }
    this.touch();
  }

  /** The field of view: the hexes round where the explorer stands are viewed in full, the ring beyond sensed. */
  private async viewAround(): Promise<void> {
    const r = (await this.bridge.enqueue(VIEW_AROUND))[0];
    if (!r) return;
    const ids = [...((r["viewed"] as string[]) ?? []), ...((r["sensed"] as string[]) ?? [])];
    if (ids.length) this.merge(await this.bridge.enqueue(READ_HEXES, { ids }));
  }

  private async readSignposts(): Promise<Map<string, Side[]>> {
    const rows = await this.bridge.enqueue(READ_SIGNPOSTS);
    return groupSignposts(rows.map((r) => ({ at: r["at"] as string, dq: r["dq"] as number, dr: r["dr"] as number })));
  }

  /** The day, from 1 to seven: the robot's parts so far, plus one. */
  get day(): number {
    return Math.min(DAYS, this.parts.length + 1);
  }

  get over(): boolean {
    return this.player.over === true;
  }

  private adjacent(a: HexState, b: HexState): boolean {
    return neighbours(a.col, a.row).some(([c, r]) => c === b.col && r === b.row);
  }

  // --- undo ---

  private snapshot(): Snapshot {
    return {
      tiles: new Map([...this.tiles].map(([id, t]) => [id, { ...t }])),
      edges: this.edges.map((e) => ({ ...e })),
      player: { ...this.player },
      facing: this.facing,
      parts: [...this.parts],
    };
  }

  canUndo(): boolean {
    return this.undoSnap !== null && !this.pending && !this.over;
  }

  /**
   * Take back the last action, the end of a day included, and nothing before it. The graph is put back as it was
   * (the edges, the hexes whose knowledge or anchor changed, the explorer), then the cache.
   */
  async undo(): Promise<void> {
    const snap = this.undoSnap;
    if (!snap || this.pending || this.over) return;
    this.undoSnap = null;
    return this.act("undo", async () => {
      const changed: { id: string; state: Knowledge; anchor: boolean | null; mapped: boolean | null }[] = [];
      for (const [id, t] of snap.tiles) {
        const now = this.tiles.get(id);
        if (!now || now.state !== t.state || Boolean(now.anchor) !== Boolean(t.anchor) || Boolean(now.mapped) !== Boolean(t.mapped))
          changed.push({ id, state: t.state, anchor: t.anchor ? true : null, mapped: t.mapped ? true : null });
      }
      const edgesOf = (kind: Edge["kind"]) => snap.edges.filter((e) => e.kind === kind).map((e) => ({ from: e.from, to: e.to }));
      await this.bridge.enqueue(UNDO_CLEAR_EDGES);
      await this.bridge.enqueue(UNDO_LOOSE, { edges: edgesOf("LOOSE") });
      await this.bridge.enqueue(UNDO_SECURED, { edges: edgesOf("SECURED") });
      await this.bridge.enqueue(UNDO_HEXES, { rows: changed });
      await this.bridge.enqueue(UNDO_CLEAR_PARTS);
      await this.bridge.enqueue(UNDO_PARTS, { parts: snap.parts.map((kind, i) => ({ kind, n: i + 1 })) });
      await this.bridge.enqueue(UNDO_PLAYER, { at: snap.player.at, steps: snap.player.steps, markers: snap.player.markers });
      this.tiles.clear();
      for (const [id, t] of snap.tiles) this.tiles.set(id, t);
      this.edges = snap.edges;
      this.player = snap.player;
      this.parts = snap.parts;
      this.signposts = await this.readSignposts();
      this.facing = snap.facing;
      this.lastFogged = [];
      this.lastBanked = null;
      this.undone++;
    }, { keepUndo: true });
  }

  // --- the thread ---

  /** The loose thread, if one is in play: at most one at a time (ADR-011, 2.4). */
  loose(): Edge[] {
    return this.edges.filter((e) => e.kind === "LOOSE");
  }

  /** The hex the thread was extended from to reach the explorer, when the explorer is at its head. */
  predecessor(): string | undefined {
    const here = this.player.at;
    const loose = this.loose();
    if (loose.some((e) => e.from === here)) return undefined; // not the head
    return loose.find((e) => e.to === here)?.from;
  }

  /** Can the explorer start or lengthen a thread from where they stand? Mirrors the guard in EXTEND. */
  canGrowHere(): boolean {
    const hex = this.here();
    if (!hex) return false;
    if (this.loose().length === 0) return Boolean(hex.anchor) || this.canBranchHere();
    return this.predecessor() !== undefined;
  }

  /** Can a flag go on the hex the explorer stands on: a secured path hex that is not an anchor, with no thread in play, and a waymarker to spend? */
  canBranchHere(): boolean {
    const hex = this.here();
    return Boolean(hex && hex.state === "path" && !hex.anchor && this.loose().length === 0 && this.player.markers > 0);
  }

  /** Does the loose thread touch this hex? The thread may not cross itself or return to where it began. */
  private onThread(id: string): boolean {
    return this.loose().some((e) => e.from === id || e.to === id);
  }

  /** Can the explorer extend onto this hex now? A local check; the statement decides for real. */
  canExtend(id: string): boolean {
    const target = this.tiles.get(id);
    const here = this.here();
    if (!target || !here || this.pending) return false;
    if (target.state === "hidden") return false;
    if (this.player.steps < (target.cost ?? 1) || !this.canGrowHere()) return false;
    if (this.onThread(id)) return false;
    return this.adjacent(here, target);
  }

  // --- actions ---

  private say(text: string): void {
    this.message = text;
    this.touch();
  }

  /** Run one action: it is pending until its reply is applied, and never throws. */
  private async act(target: string, run: () => Promise<void>, opts: { keepUndo?: boolean } = {}): Promise<void> {
    if (this.over) return; // the game is over: nothing more is done
    let snap: Snapshot | undefined;
    const result = await this.cache.act(target, {
      run: async () => {
        this.message = "";
        this.applied = false;
        snap = this.snapshot();
        await run();
      },
    });
    if (result.ok) {
      if (this.applied && !opts.keepUndo && snap) this.undoSnap = snap; // an automatic follow-up (the day ending) undoes with its cause
    } else {
      this.message = `ERR: ${result.error.message}`;
    }
    this.touch();
  }

  /**
   * What acting on a hex would do, without doing it: the explorer reels the thread in when the hex is the one behind
   * it; otherwise extends the thread there when it can (over unexplored or remembered ground, or across a path while
   * a thread is in play); otherwise steps onto known ground; and from an anchor travels to another. `step` asks for a
   * step in place of an extension. When nothing can be done, `reason` says why.
   */
  intent(id: string, step = false): Intent {
    const target = this.tiles.get(id);
    const here = this.here();
    if (!target || !here || id === here.id || this.over) return { kind: "none", reason: "" };
    if (this.pending) return { kind: "none", reason: "…" };
    if (this.adjacent(here, target)) {
      if (this.predecessor() === id) return { kind: "reel" };
      const known = target.state === "seen" || target.state === "path";
      if (step) return known ? { kind: "step" } : { kind: "none", reason: "You can only step onto ground you know." };
      // a path is crossed only by a thread already in play; with none, a click on a path is a step along it
      const crossing = target.state === "path" && this.loose().length === 0;
      if (!crossing && this.canExtend(id)) return { kind: "extend" };
      if (known) return { kind: "step" };
      if (target.state === "sensed" || target.state === "viewed") {
        const cost = target.cost ?? 1;
        return {
          kind: "none",
          reason:
            this.player.steps <= 0
              ? "The day is spent."
              : this.player.steps < cost
                ? "Too steep: you cannot afford that climb."
                : this.here()?.state === "path" && !this.here()?.anchor && this.loose().length === 0 && this.player.markers <= 0
                  ? "No waymarkers left: you cannot branch from here."
                  : "Extend from an anchor, or from the end of your path.",
        };
      }
      return { kind: "none", reason: "You cannot see that far yet." };
    }
    if (here.anchor && target.anchor && (target.state === "path" || target.state === "seen")) return { kind: "travel" };
    return { kind: "none", reason: "Click a hex next to you, or another anchor." };
  }

  /** Act on a hex (a click). Shift steps. A click on a neighbour also turns the explorer to face it. */
  async click(id: string, opts: { step?: boolean } = {}): Promise<void> {
    const target = this.tiles.get(id);
    const here = this.here();
    if (target && here && id !== here.id && this.adjacent(here, target)) this.facing = sideTo(here, target);
    const i = this.intent(id, opts.step);
    switch (i.kind) {
      case "reel":
        return this.reelIn();
      case "extend":
        return this.extend(id);
      case "step":
        return this.step(id);
      case "travel":
        return this.travel(id);
      case "none":
        return i.reason ? this.say(i.reason) : undefined;
    }
  }

  // --- facing and the keyboard ---

  /** Turn the explorer a sixth of a turn per step: positive clockwise on screen, negative counter-clockwise. */
  turn(steps: number): void {
    this.facing = turnSide(this.facing, steps);
    this.touch();
  }

  /** The hex the explorer faces (or, with `behind`, the one opposite). Undefined at the edge of the map. */
  faced(behind = false): HexState | undefined {
    const here = this.here();
    if (!here) return undefined;
    const n = neighbourAt(here, behind ? oppositeSide(this.facing) : this.facing);
    return this.tileAt(n.col, n.row);
  }

  /** Act on the hex ahead (or behind), as a click would; the facing is unchanged by moving backwards. */
  async go(behind = false, opts: { step?: boolean } = {}): Promise<void> {
    const t = this.faced(behind);
    if (!t) return this.say("That is the edge of the map.");
    const facing = this.facing;
    await this.click(t.id, opts);
    if (behind) {
      this.facing = facing;
      this.touch();
    }
  }

  /** Extend the thread onto a hex. Resolves when the reply has been applied. */
  async extend(id: string): Promise<void> {
    if (!this.canExtend(id)) return this.say("The thread will not go there.");
    const from = this.player.at;
    let secured = false;
    // from a secured path hex that is not an anchor, a flag is placed there first: a branch (ADR-011, amended 2026-11-19)
    const branching = !this.here()!.anchor && this.loose().length === 0;
    await this.act(id, async () => {
      const rows = await this.bridge.enqueue(branching ? BRANCH_EXTEND : EXTEND, { to: id, now: ++this.moves });
      const r = rows[0];
      if (!r) {
        this.message = "The thread will not go there.";
        return;
      }
      this.applied = true;
      if (branching) this.tiles.get(from)!.anchor = true; // the flag is placed on the hex being left
      const hex = this.tiles.get(id)!;
      this.facing = sideTo(this.tiles.get(from)!, hex);
      hex.state = "path";
      this.edges.push({ from, to: id, kind: "LOOSE" });
      this.player = { ...this.player, at: id, steps: r["steps"] as number, markers: r["markers"] as number };
      if (branching) this.message = "Flag placed: the path branches here.";
      const sensed = (r["sensed"] as string[]) ?? [];
      for (const sid of sensed) {
        const t = this.tiles.get(sid);
        if (t) t.state = "sensed";
      }
      if (sensed.length) this.merge(await this.bridge.enqueue(READ_HEXES, { ids: sensed }));
      await this.viewAround();
      if (r["anchor"]) {
        secured = true;
        await this.bridge.enqueue(SECURE);
        const here = this.tiles.get(id)!;
        if (here.feature === "tower") {
          here.mapped = true; // arrived at a settlement: its signposts show
          this.signposts = await this.readSignposts();
        }
        this.edges = this.edges.map((e) => ({ ...e, kind: "SECURED" as const }));
        this.message = "Anchor reached: the path is secured.";
      }
    });
    if (secured && (await this.allRouted())) return this.finish(); // every settlement saved: the game ends early
    if (this.player.steps <= 0) await this.endDay(true); // the day ends when the steps run out
  }

  /** Reel in: step back along the thread and take its last edge in. Costs a step. */
  async reelIn(): Promise<void> {
    const back = this.predecessor();
    if (!back) return this.say("There is no thread to reel in.");
    const from = this.player.at;
    await this.act(back, async () => {
      const rows = await this.bridge.enqueue(REEL_IN);
      const r = rows[0];
      if (!r) {
        this.message = "The thread will not come in.";
        return;
      }
      this.applied = true;
      this.edges = this.edges.filter((e) => !(e.kind === "LOOSE" && e.to === from));
      const left = this.tiles.get(from);
      if (left) left.state = this.edges.some((e) => e.kind === "SECURED" && (e.from === from || e.to === from)) ? "path" : "seen";
      this.player = { ...this.player, at: r["at"] as string, steps: r["steps"] as number };
      // face the hex just left, so the next extension runs the way the thread did
      const now = this.here();
      if (now && left) this.facing = sideTo(now, left);
      await this.viewAround();
    });
    if (this.player.steps <= 0) await this.endDay(true); // the day ends when the steps run out
  }

  /** Step one hex over known ground; lays no thread. */
  async step(id: string): Promise<void> {
    const target = this.tiles.get(id);
    const here = this.here();
    if (!target || !here || !this.adjacent(here, target) || (target.state !== "seen" && target.state !== "path"))
      return this.say("You can only step onto ground you know, next to you.");
    if (this.player.steps < (target.cost ?? 1)) return this.say("Too steep: you cannot afford that step.");
    await this.act(id, async () => {
      const rows = await this.bridge.enqueue(STEP, { to: id });
      if (!rows[0]) {
        this.message = "You cannot step there.";
        return;
      }
      this.applied = true;
      this.facing = sideTo(here, target);
      this.player = { ...this.player, at: rows[0]["at"] as string, steps: rows[0]["steps"] as number };
      await this.viewAround();
    });
    if (this.player.steps <= 0) await this.endDay(true); // the day ends when the steps run out
  }

  /** Travel between anchors joined by secured paths for one step. Refused while a path is in play. */
  async travel(id: string): Promise<void> {
    const target = this.tiles.get(id);
    if (!target?.anchor || !this.here()?.anchor) return this.say("You can only travel between anchors.");
    if (this.loose().length > 0) return this.say("Bank or abandon your path before travelling.");
    await this.act(id, async () => {
      const rows = await this.bridge.enqueue(TRAVEL, { to: id });
      const r = rows[0];
      if (!r) {
        this.message = "No secured path leads there.";
        return;
      }
      this.applied = true;
      this.player = { ...this.player, at: r["at"] as string, steps: r["steps"] as number };
      await this.viewAround();
    });
    if (this.player.steps <= 0) await this.endDay(true); // the day ends when the steps run out
  }

  /**
   * Place a waymarker: the path is banked as secured ground and a new path can grow from here with the steps still
   * remaining. Requires a waymarker to spend, a path to bank, and a hex that is not an anchor already.
   */
  /** Drop a flag on a secured path hex, so that a thread can start here (ADR-011, amended 2026-11-19). Costs a waymarker and no steps. */
  private async placeFlag(id: string): Promise<void> {
    return this.act(id, async () => {
      const rows = await this.bridge.enqueue(PLACE_FLAG);
      const r = rows[0];
      if (!r) {
        this.message = "A flag will not stand here.";
        return;
      }
      this.applied = true;
      this.tiles.get(id)!.anchor = true;
      this.player = { ...this.player, markers: r["markers"] as number };
      this.message = "Flag placed: a thread can start here.";
      this.touch();
    });
  }

  async placeWaymarker(): Promise<void> {
    const here = this.here();
    if (!here) return;
    if (this.player.markers <= 0) return this.say("No waymarkers left in the bag.");
    if (here.anchor) return this.say("You stand on an anchor already.");
    if (this.loose().length === 0 && here.state === "path") return this.placeFlag(here.id); // a flag on a secured path: a branch
    if (this.loose().length === 0) return this.say("There is no path to bank: extend the path first.");
    return this.act(here.id, async () => {
      const path = this.loose().map((e) => ({ ...e }));
      const rows = await this.bridge.enqueue(PLACE_WAYMARKER);
      const r = rows[0];
      if (!r) {
        this.message = "The waymarker will not take here.";
        return;
      }
      this.applied = true;
      here.anchor = true;
      this.lastBanked = { waymark: here.id, from: path[0]?.from ?? here.id, edges: path };
      this.edges = this.edges.map((e) => ({ ...e, kind: "SECURED" as const }));
      this.player = { at: r["at"] as string, steps: r["steps"] as number, markers: r["markers"] as number };
      const secured = r["secured"] as number;
      this.message = `Waymarker placed: ${secured} step${secured === 1 ? "" : "s"} of path banked. Keep exploring.`;
      this.touch();
    });
  }

  /**
   * End the day: the loose path is abandoned, the explorer returns to the camp, the steps refill, and everything the
   * secured network does not disclose fogs over. Fogged hexes are forgotten here, not patched.
   */
  async endDay(auto = false): Promise<void> {
    return this.act("day", async () => {
      const n = this.parts.length + 1;
      const part = PARTS[n - 1];
      if (!part) {
        this.message = "The robot is complete.";
        return;
      }
      const rows = await this.bridge.enqueue(END_DAY, { budget: START_STEPS, part, n, last: n >= DAYS });
      const r = rows[0];
      if (!r) {
        this.message = "The day will not end.";
        return;
      }
      this.applied = true;
      this.dayEnds++;
      // What the day forgot, ordered outward from the abandoned thread, so the fog can close from the path out.
      const fogged = (r["fogged"] as string[]) ?? [];
      const thread = new Set<string>();
      for (const e of this.edges) if (e.kind === "LOOSE") { thread.add(e.from); thread.add(e.to); }
      if (!thread.size) thread.add(r["at"] as string); // no path to measure from: the fog closes from home
      const rings = new Map<string, number>([...thread].map((id) => [id, 0]));
      const forgotten = new Set(fogged);
      let frontier = [...thread];
      while (frontier.length) {
        const next: string[] = [];
        for (const id of frontier) {
          const t = this.tiles.get(id);
          if (!t) continue;
          for (const [c, r2] of neighbours(t.col, t.row)) {
            const nid = this.tileAt(c, r2)?.id;
            if (nid && forgotten.has(nid) && !rings.has(nid)) {
              rings.set(nid, (rings.get(id) ?? 0) + 1);
              next.push(nid);
            }
          }
        }
        frontier = next;
      }
      this.lastFogged = fogged
        .map((id) => {
          const t = this.tiles.get(id);
          return { id, ring: rings.get(id) ?? 99, state: t?.state ?? "hidden", terrain: t?.terrain, feature: t?.feature };
        })
        .sort((a, b) => a.ring - b.ring || a.id.localeCompare(b.id));
      this.edges = this.edges.filter((e) => e.kind !== "LOOSE");
      for (const id of fogged) {
        const t = this.tiles.get(id);
        if (!t) continue;
        t.state = "hidden";
        delete t.terrain; // forgotten: the client no longer holds the ground truth
        delete t.feature;
        delete t.anchor;
      }
      if (fogged.length) this.merge(await this.bridge.enqueue(READ_HEXES, { ids: fogged })); // some come back disclosed
      this.parts = [...this.parts, part];
      this.player = { ...this.player, at: r["at"] as string, steps: r["steps"] as number, over: n >= DAYS };
      await this.viewAround(); // home again, and the camp's field of view with it
      const lost = r["lost"] as number;
      this.message = lost ? `Day over: ${lost} step${lost === 1 ? "" : "s"} of path lost to the fog.` : "Day over. Back at camp.";
      this.touch();
    }, { keepUndo: auto });
  }

  /** Each settlement (a tower) and whether secured paths join it to the camp. */
  async settlements(): Promise<{ id: string; joined: boolean }[]> {
    const rows = await this.bridge.enqueue(TOWERS);
    return rows.map((r) => ({ id: r["id"] as string, joined: r["joined"] === true }));
  }

  /** Is every settlement joined to the camp by secured paths? */
  async allRouted(): Promise<boolean> {
    const all = await this.settlements();
    return all.length > 0 && all.every((s) => s.joined);
  }

  /** End the game now (every settlement is routed): nothing more can be done, and there is nothing to undo. */
  async finish(): Promise<void> {
    if (this.over) return;
    await this.bridge.enqueue(GAME_OVER);
    this.player = { ...this.player, over: true };
    this.undoSnap = null;
    this.touch();
  }

  /** How the game went: settlements routed, waymarkers placed, the day it ended on. Read from the graph. */
  async outcome(): Promise<Outcome> {
    const [all, markers] = await Promise.all([this.settlements(), this.bridge.enqueue(MARKERS_USED)]);
    return {
      routed: all.filter((s) => s.joined).length,
      total: all.length,
      markers: (markers[0]?.["markers"] as number) ?? 0,
      days: this.day,
    };
  }

  async score(): Promise<number> {
    return computeScore(await this.outcome());
  }
}

/** A client double for a state with no engine client behind it: always ready, and with nothing to follow. */
function standalone(bridge: Bridge): CacheClient {
  return {
    status: "ready",
    generation: 1,
    query: (statement, params) => bridge.enqueue(statement, params ?? null).then((rows) => ({ error: null, rows }) as never),
    on: () => () => undefined,
    onGeneration: () => () => undefined,
  } as CacheClient;
}
