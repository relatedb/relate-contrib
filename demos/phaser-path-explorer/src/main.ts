import Phaser from "phaser";
import engineUrl from "@relate/relate-wasm/relate_bg.wasm?url";
import { createClient } from "@relate/web";
import { DEFAULT_PIXEL, MapScene, boardSizePx } from "./game/MapScene.js";
import { Bridge } from "./game/bridge.js";
import { GameState } from "./game/state.js";
import { COLS, ROWS, generateRows } from "./game/world.js";
import { APPLICATION, worldDocument } from "./game/graph.js";

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
    history.replaceState(null, "", `${location.pathname}${params.size ? `?${params}` : ""}`);
  }
  const bridge = new Bridge((statement, p) => client.query(statement, p));
  const state = new GameState(bridge);
  await state.load();
  // for driving the game from the browser console while developing (not in a production build)
  if (import.meta.env.DEV) Object.assign(window, { __state: state, __bridge: bridge });
  const { width, height } = boardSizePx(pixel);
  // No status line: the world says what it can. Only a failure of the system itself, or storage that will not keep
  // the world, is told in words.
  const hud = (s: GameState) => {
    const storage = client.storage;
    const lost = storage.kind === "memory" ? `Progress is not being saved${storage.reason ? ` (${storage.reason})` : ""}.` : "";
    say(s.message.startsWith("ERR:") ? s.message : lost);
  };
  const game = new Phaser.Game({
    type: Phaser.AUTO,
    parent: "game",
    width: width * dpr,
    height: height * dpr,
    // smooth vector shapes (links, rings, nodes); the terrain texture is set to nearest-neighbour filtering itself
    pixelArt: false,
    antialias: true,
    roundPixels: false,
    backgroundColor: "#002b43",
    scene: [new MapScene(state, pixel, dpr, hud)],
  });
  // the canvas holds dpr times the pixels, shown at the chosen size
  game.events.once(Phaser.Core.Events.READY, () => {
    game.canvas.style.width = `${width}px`;
    game.canvas.style.height = `${height}px`;
  });
}

// The one piece of interface: a plain statement of the game and its keys. Shown on the first visit; H or ? brings it
// back, and any key or a click puts it away.
const help = document.getElementById("help")!;
const seen = (() => {
  try {
    return localStorage.getItem("path-explorer-help") === "1";
  } catch {
    return false;
  }
})();
const showHelp = (on: boolean) => {
  help.hidden = !on;
  if (!on)
    try {
      localStorage.setItem("path-explorer-help", "1");
    } catch {
      /* the help simply shows again next time */
    }
};
showHelp(!seen);
window.addEventListener("keydown", (e) => {
  if (e.metaKey || e.ctrlKey || e.altKey) return;
  if (e.key === "h" || e.key === "H" || e.key === "?") showHelp(Boolean(help.hidden));
  else if (!help.hidden) showHelp(false);
});
help.addEventListener("pointerdown", () => showHelp(false));

start().catch((err: unknown) => {
  say(`ERR: ${err instanceof Error ? err.message : String(err)}`);
  console.error(err);
});
