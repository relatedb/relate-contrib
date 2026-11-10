// The cache (ADR-010, 2.6): a plain object of the board as the player may know it, patched by replies. Rendering
// reads this and never awaits. Actions go through the bridge; an extension needs its reply to know what the new hexes
// contain, so it shows as pending until the reply arrives, and a further action waits for it.
import { neighbourAt, neighbours, oppositeSide, sideTo, turnSide, type Feature, type Side, type Terrain } from "../hex/core/index.js";
import type { Bridge, Row } from "./bridge.js";
import { EXTEND, READ_BOARD, READ_EDGES, READ_HEXES, READ_PLAYER, REEL_IN, SECURE, SKIP, STEP } from "./statements.js";

export type Knowledge = "hidden" | "sensed" | "seen" | "path";

export interface HexState {
  id: string;
  col: number;
  row: number;
  state: Knowledge;
  /** Absent while hidden: the client never holds the ground truth of a hex it has not discovered. */
  terrain?: Terrain;
  feature?: Feature;
  anchor?: boolean;
}

export interface PlayerState {
  at: string;
  health: number;
  waymarks: number;
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
  return hex;
}

/** What acting on a hex would do (see `GameState.intent`). */
export type Intent = { kind: "reel" | "extend" | "step" | "skip" } | { kind: "none"; reason: string };

export class GameState {
  readonly tiles = new Map<string, HexState>();
  private readonly byPos = new Map<string, string>();
  edges: Edge[] = [];
  /** Which of the six directions the explorer faces: what the arrow keys act on. Not stored in the graph. */
  facing: Side = "e";
  player: PlayerState = { at: "", health: 0, waymarks: 0 };
  message = "";
  /** The hex an action is waiting on, while its reply is awaited. */
  pending: string | null = null;
  /** Bumped on every change, so the frame loop can redraw only when something changed. */
  version = 0;
  private moves = 0;

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
    const [board, player, edges] = await Promise.all([
      this.bridge.enqueue(READ_BOARD),
      this.bridge.enqueue(READ_PLAYER),
      this.bridge.enqueue(READ_EDGES),
    ]);
    this.tiles.clear();
    this.byPos.clear();
    this.merge(board);
    const p = player[0];
    if (p) this.player = { at: p["at"] as string, health: p["health"] as number, waymarks: p["waymarks"] as number };
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

  private adjacent(a: HexState, b: HexState): boolean {
    return neighbours(a.col, a.row).some(([c, r]) => c === b.col && r === b.row);
  }

  // --- the thread ---

  /** The loose thread, if one is in play: at most one at a time (ADR-010, 2.4). */
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
    if (this.player.waymarks <= 0 || !this.canGrowHere()) return false;
    if (this.onThread(id)) return false;
    return this.adjacent(here, target);
  }

  // --- actions ---

  private say(text: string): void {
    this.message = text;
    this.touch();
  }

  /** Run one action: it is pending until its reply is applied, and never throws. */
  private async act(target: string, run: () => Promise<void>): Promise<void> {
    this.pending = target;
    this.message = "";
    this.touch();
    try {
      await run();
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
   * a thread is in play); otherwise steps onto known ground; and from an anchor skips to another. `step` asks for a
   * step in place of an extension. When nothing can be done, `reason` says why.
   */
  intent(id: string, step = false): Intent {
    const target = this.tiles.get(id);
    const here = this.here();
    if (!target || !here || id === here.id) return { kind: "none", reason: "" };
    if (this.pending) return { kind: "none", reason: "…" };
    if (this.adjacent(here, target)) {
      if (this.predecessor() === id) return { kind: "reel" };
      const known = target.state === "seen" || target.state === "path";
      if (step) return known ? { kind: "step" } : { kind: "none", reason: "You can only step onto ground you know." };
      // a path is crossed only by a thread already in play; with none, a click on a path is a step along it
      const crossing = target.state === "path" && this.loose().length === 0;
      if (!crossing && this.canExtend(id)) return { kind: "extend" };
      if (known) return { kind: "step" };
      if (target.state === "sensed")
        return {
          kind: "none",
          reason: this.player.waymarks <= 0 ? "No waymarks left." : "Extend from an anchor, or from the end of your thread.",
        };
      return { kind: "none", reason: "You cannot see that far yet." };
    }
    if (here.anchor && target.anchor && (target.state === "path" || target.state === "seen")) return { kind: "skip" };
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
      case "skip":
        return this.skip(id);
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
    return this.act(id, async () => {
      const rows = await this.bridge.enqueue(EXTEND, { to: id, now: ++this.moves });
      const r = rows[0];
      if (!r) {
        this.message = "The thread will not go there.";
        return;
      }
      const hex = this.tiles.get(id)!;
      this.facing = sideTo(this.tiles.get(from)!, hex);
      const snag = Boolean(r["snag"]);
      hex.state = snag ? "seen" : "path";
      if (!snag) this.edges.push({ from, to: id, kind: "LOOSE" });
      this.player = { ...this.player, at: id, waymarks: this.player.waymarks - 1 };
      const sensed = (r["sensed"] as string[]) ?? [];
      for (const sid of sensed) {
        const t = this.tiles.get(sid);
        if (t) t.state = "sensed";
      }
      if (sensed.length) this.merge(await this.bridge.enqueue(READ_HEXES, { ids: sensed }));
      if (r["anchor"]) {
        await this.bridge.enqueue(SECURE);
        this.edges = this.edges.map((e) => ({ ...e, kind: "SECURED" as const }));
        this.message = "Anchor reached: the thread is secured.";
      } else if (snag) {
        this.message = "The thread snags. You are cut off.";
      }
    });
  }

  /** Reel in: step back along the thread, taking its last edge in and its waymark back. */
  async reelIn(): Promise<void> {
    const back = this.predecessor();
    if (!back) return this.say("There is no thread to reel in.");
    const from = this.player.at;
    return this.act(back, async () => {
      const rows = await this.bridge.enqueue(REEL_IN);
      const r = rows[0];
      if (!r) {
        this.message = "The thread will not come in.";
        return;
      }
      this.edges = this.edges.filter((e) => !(e.kind === "LOOSE" && e.to === from));
      const left = this.tiles.get(from);
      if (left) left.state = this.edges.some((e) => e.kind === "SECURED" && (e.from === from || e.to === from)) ? "path" : "seen";
      this.player = { ...this.player, at: r["at"] as string, waymarks: this.player.waymarks + 1 };
      // face the hex just left, so the next extension runs the way the thread did
      const now = this.here();
      if (now && left) this.facing = sideTo(now, left);
    });
  }

  /** Step one hex over known ground; lays no thread. */
  async step(id: string): Promise<void> {
    const target = this.tiles.get(id);
    const here = this.here();
    if (!target || !here || !this.adjacent(here, target) || (target.state !== "seen" && target.state !== "path"))
      return this.say("You can only step onto ground you know, next to you.");
    return this.act(id, async () => {
      const rows = await this.bridge.enqueue(STEP, { to: id });
      if (!rows[0]) {
        this.message = "You cannot step there.";
        return;
      }
      this.facing = sideTo(here, target);
      this.player = { ...this.player, at: rows[0]["at"] as string };
    });
  }

  /** Skip to another anchor along secured paths, in one turn. */
  async skip(id: string): Promise<void> {
    const target = this.tiles.get(id);
    if (!target?.anchor || !this.here()?.anchor) return this.say("You can only skip between anchors.");
    if (this.loose().length > 0) return this.say("Reel in or secure your thread before skipping.");
    return this.act(id, async () => {
      const rows = await this.bridge.enqueue(SKIP, { to: id });
      if (!rows[0]) {
        this.message = "No secured path leads there.";
        return;
      }
      this.player = { ...this.player, at: rows[0]["at"] as string };
    });
  }
}
