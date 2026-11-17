import Phaser from "phaser";
import engineUrl from "@relate/relate-wasm/relate_bg.wasm?url";
import { createClient } from "@relate/web";
import { DEFAULT_PIXEL, MapScene, boardSizePx } from "./game/MapScene.js";
import { Bridge } from "./game/bridge.js";
import { GameState } from "./game/state.js";
import { COLS, ROWS, generateRows } from "./game/world.js";
import { APPLICATION, worldDocument } from "./game/graph.js";
import { loadScores, recordScore, type KeyValueStore } from "./game/scores.js";
import { createSplash, type Splash } from "./splash.js";
import { runDemo } from "./demo.js";

const params = new URLSearchParams(location.search);
const seed = params.get("seed") ?? "first-light";
// ?cols=16&rows=14&pixel=4 tries another board size (needs ?reset=1 for a stored world)
const cols = Number(params.get("cols") ?? COLS);
const rowsCount = Number(params.get("rows") ?? ROWS);
const pixel = Number(params.get("pixel") ?? DEFAULT_PIXEL);
// render at the display's pixel density so lines, rings and nodes stay sharp (?dpr=2 to try it); whole numbers keep
// the pixel art crisp
const dpr = Math.max(1, Math.min(3, Number(params.get("dpr")) || Math.round(window.devicePixelRatio) || 1));
const status = document.getElementById("status")!;
const say = (text: string) => {
  status.textContent = text;
  status.hidden = text === "";
};
say("");

// The world is an application graph (ADR-009, ADR-011 2.4): seeded once on first run and kept in the browser.
// A new seed only takes effect on a first run, or with ?reset=1, which discards the stored world.
const client = createClient({
  engineUrl,
  navigation: "client-routing",
  application: { ...APPLICATION, seed: worldDocument(generateRows(seed, cols, rowsCount)), indexes: [{ label: "Hex", property: "id" }] },
});

async function start(): Promise<void> {
  if (params.get("reset") === "1") {
    await client.resetApplication();
    // drop ?reset from the address, so a reload (or the dev server's hot reload) does not reset the world again
    params.delete("reset");
  }
  const playNow = params.get("play") === "1"; // a new game was chosen on the splash: go straight in
  params.delete("play");
  history.replaceState(null, "", `${location.pathname}${params.size ? `?${params}` : ""}`);
  const bridge = new Bridge((statement, p) => client.query(statement, p));
  const state = new GameState(bridge);
  await state.load();
  // for driving the game from the browser console while developing (not in a production build)
  if (import.meta.env.DEV) Object.assign(window, { __state: state, __bridge: bridge });
  const { width, height } = boardSizePx(pixel);
  // No status line: the world says what it can. Only a failure of the system itself, or storage that will not keep
  // the world, is told in words.
  let splash: Splash | undefined;
  const store: KeyValueStore | undefined = (() => {
    try {
      return localStorage;
    } catch {
      return undefined; // storage can be blocked; scores are then simply not kept
    }
  })();
  let ended = state.over; // a game already over when the page loaded was scored in its own time
  // the splash tells the result once the finale has played out, whichever of the score and the finale is ready last
  let result: number | undefined;
  let finaleDone = false;
  const tellResult = () => {
    if (result !== undefined && finaleDone) splash?.show({ result });
  };
  let scene: MapScene | undefined;
  const hud = (s: GameState) => {
    if (s.over && !ended) {
      ended = true;
      void s.score().then((score) => {
        recordScore(store, score);
        result = score;
        tellResult();
      });
    }
    const storage = client.storage;
    const lost = storage.kind === "memory" ? `Progress is not being saved${storage.reason ? ` (${storage.reason})` : ""}.` : "";
    say(s.message.startsWith("ERR:") ? s.message : lost);
  };
  const makeGame = (make: () => MapScene): Phaser.Game => {
    const g = new Phaser.Game({
      type: Phaser.AUTO,
      parent: "game",
      width: width * dpr,
      height: height * dpr,
      // smooth vector shapes (links, rings, nodes); the terrain texture is set to nearest-neighbour filtering itself
      pixelArt: false,
      antialias: true,
      roundPixels: false,
      backgroundColor: "#002b43",
      scene: [make()],
    });
    // the canvas holds dpr times the pixels, shown at the chosen size
    g.events.once(Phaser.Core.Events.READY, () => {
      g.canvas.style.width = `${width}px`;
      g.canvas.style.height = `${height}px`;
    });
    return g;
  };
  const startReal = () => makeGame(() => (scene = new MapScene(state, pixel, dpr, hud, () => splash?.open ?? true, () => { finaleDone = true; tellResult(); })));

  // Behind the splash, a demo: an explorer wandering a throwaway island of its own, on an in-memory graph that is never
  // the saved game. A game that is already over shows its own end state instead.
  let stopDemo: (() => void) | undefined;
  let demoGame: Phaser.Game | undefined;
  const openDemo = async (): Promise<boolean> => {
    try {
      const rows = generateRows(Math.random().toString(36).slice(2, 8), cols, rowsCount);
      // a graph given as data, with no descriptor: no store, so nothing of it is kept
      const demoClient = createClient({ engineUrl, navigation: "multi-page", graph: { document: worldDocument(rows) } });
      const demoBridge = new Bridge((statement, p) => demoClient.query(statement, p));
      const demoState = new GameState(demoBridge);
      await demoState.load();
      if (demoState.tiles.size === 0) return false;
      demoGame = makeGame(() => new MapScene(demoState, pixel, dpr, () => {}, () => true));
      stopDemo = runDemo({ rows, state: demoState, bridge: demoBridge, start: [Math.floor(cols / 2), Math.floor(rowsCount / 2)] });
      return true;
    } catch (err) {
      console.warn("the demo could not start", err);
      return false;
    }
  };
  /** Any key, on the splash over the demo: the demo goes, and the saved game takes its place. */
  const leaveDemo = () => {
    if (!demoGame) return;
    stopDemo?.();
    demoGame.destroy(true);
    demoGame = undefined;
    stopDemo = undefined;
    startReal();
  };
  const demoWanted = !playNow && !state.over;
  if (!(demoWanted && (await openDemo()))) startReal();
  splash = createSplash({
    canContinue: () => !state.over || (scene?.finaleActive ?? false), // the finale can be watched again, not played on
    scores: () => loadScores(store),
    // a new game is a new random island: a reload with a fresh seed and a reset, straight past the splash
    onNew: () => location.assign(`${location.pathname}?seed=${Math.random().toString(36).slice(2, 8)}&reset=1&play=1`),
    onContinue: leaveDemo,
    pixel,
    cols,
    rows: rowsCount,
  });
  if (playNow) splash.hide();
  else splash.show(state.over ? { result: await state.score() } : {});
}

start().catch((err: unknown) => {
  say(`ERR: ${err instanceof Error ? err.message : String(err)}`);
  console.error(err);
});
