// The cache (ADR-011, 2.6): a plain object of the board as the player may know it, patched by replies. Rendering
// reads this and never awaits. Actions go through the bridge; an extension needs its reply to know what the new hexes
// contain, so it shows as pending until the reply arrives, and a further action waits for it.
import { neighbourAt, neighbours, oppositeSide, sideTo, turnSide, type Feature, type Side, type Terrain } from "../hex/core/index.js";
import type { Bridge, Row } from "./bridge.js";
import {
  END_DAY, EXTEND, PLACE_WAYMARKER, READ_BOARD, READ_EDGES, READ_HEXES, READ_PLAYER, REEL_IN, SECURE, STEP, TRAVEL, TOWERS,
  UNDO_CLEAR_EDGES, UNDO_CLEAR_PARTS, UNDO_HEXES, UNDO_LOOSE, UNDO_PARTS, UNDO_PLAYER, UNDO_SECURED,
  GAME_OVER, MARKERS_USED, READ_PARTS,
} from "./statements.js";
import { PARTS, computeScore, type Outcome } from "./score.js";
import { DAYS, START_STEPS } from "./world.js";

export type Knowledge = "hidden" | "sensed" | "seen" | "path";

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
  message = "";
  /** The hex an action is waiting on, while its reply is awaited. */
  pending: string | null = null;
  /** Bumped on every change, so the frame loop can redraw only when something changed. */
  version = 0;
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

  constructor(private readonly bridge: Bridge) {}

  private touch(): void {
    this.version++;
  }

  private merge(rows: Row[]): void {
    for (const r of rows) {
      const hex = toHex(r);
      this.tiles.set(hex.id, hex);
      this.byPos.set(`${hex.col},${hex.row}`, hex.id);
    }
  }

  async load(): Promise<void> {
    const [board, player, edges, parts] = await Promise.all([
      this.bridge.enqueue(READ_BOARD),
      this.bridge.enqueue(READ_PLAYER),
      this.bridge.enqueue(READ_EDGES),
      this.bridge.enqueue(READ_PARTS),
    ]);
    this.parts = parts.map((r) => r["kind"] as string);
    this.tiles.clear();
    this.byPos.clear();
    this.merge(board);
    const p = player[0];
    if (p) this.player = { at: p["at"] as string, steps: p["steps"] as number, markers: p["markers"] as number, over: p["over"] === true };
    this.edges = edges.map((e) => ({ from: e["from"] as string, to: e["to"] as string, kind: e["kind"] as Edge["kind"] }));
    this.touch();
  }

  tileAt(col: number, row: number): HexState | undefined {
    const id = this.byPos.get(`${col},${row}`);
    return id ? this.tiles.get(id) : undefined;
  }

  /** The hex the explorer stands on. */
  here(): HexState | undefined {
    return this.tiles.get(this.player.at);
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
      const changed: { id: string; state: Knowledge; anchor: boolean | null }[] = [];
      for (const [id, t] of snap.tiles) {
        const now = this.tiles.get(id);
        if (!now || now.state !== t.state || Boolean(now.anchor) !== Boolean(t.anchor))
          changed.push({ id, state: t.state, anchor: t.anchor ? true : null });
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
    if (this.loose().length === 0) return Boolean(hex.anchor);
    return this.predecessor() !== undefined;
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
    this.pending = target;
    this.message = "";
    this.applied = false;
    const snap = this.snapshot();
    this.touch();
    try {
      await run();
      if (this.applied && !opts.keepUndo) this.undoSnap = snap; // an automatic follow-up (the day ending) undoes with its cause
    } catch (err) {
      this.message = `ERR: ${err instanceof Error ? err.message : String(err)}`;
    } finally {
      this.pending = null;
      this.touch();
    }
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
      if (target.state === "sensed") {
        const cost = target.cost ?? 1;
        return {
          kind: "none",
          reason:
            this.player.steps <= 0
              ? "The day is spent."
              : this.player.steps < cost
                ? "Too steep: you cannot afford that climb."
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
    await this.act(id, async () => {
      const rows = await this.bridge.enqueue(EXTEND, { to: id, now: ++this.moves });
      const r = rows[0];
      if (!r) {
        this.message = "The thread will not go there.";
        return;
      }
      this.applied = true;
      const hex = this.tiles.get(id)!;
      this.facing = sideTo(this.tiles.get(from)!, hex);
      hex.state = "path";
      this.edges.push({ from, to: id, kind: "LOOSE" });
      this.player = { ...this.player, at: id, steps: r["steps"] as number, markers: r["markers"] as number };
      const sensed = (r["sensed"] as string[]) ?? [];
      for (const sid of sensed) {
        const t = this.tiles.get(sid);
        if (t) t.state = "sensed";
      }
      if (sensed.length) this.merge(await this.bridge.enqueue(READ_HEXES, { ids: sensed }));
      if (r["anchor"]) {
        secured = true;
        await this.bridge.enqueue(SECURE);
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
    });
    if (this.player.steps <= 0) await this.endDay(true); // the day ends when the steps run out
  }

  /**
   * Place a waymarker: the path is banked as secured ground and a new path can grow from here with the steps still
   * remaining. Requires a waymarker to spend, a path to bank, and a hex that is not an anchor already.
   */
  async placeWaymarker(): Promise<void> {
    const here = this.here();
    if (!here) return;
    if (this.player.markers <= 0) return this.say("No waymarkers left in the bag.");
    if (here.anchor) return this.say("You stand on an anchor already.");
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
