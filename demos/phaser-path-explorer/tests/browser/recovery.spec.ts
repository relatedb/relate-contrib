// covers-ph: FR-015, FR-016, SC-002, SC-006
// The path explorer on the package, in a real browser: a trapped engine is replaced and the board is rebuilt from the
// restored graph with no action repeated (SC-002), and the splash's throwaway world leaves the saved game as it was (SC-006).
import { expect, test, type Page } from "@playwright/test";

/** What the cache shows of the board and the explorer, as one comparable string. */
const snapshot = (page: Page) =>
  page.evaluate(() => {
    const s = (window as any).__state;
    const tiles = [...s.tiles.values()].map((t: any) => `${t.id}:${t.state}`).sort();
    return JSON.stringify({ tiles, player: s.player });
  });

const loaded = (page: Page) => page.waitForFunction(() => (window as any).__state?.tiles?.size > 0);

test("a trapped engine is replaced and the board is rebuilt from the restored graph, with nothing repeated", async ({ page }, info) => {
  await page.goto("/?play=1&reset=1");
  await loaded(page);
  // change the graph behind the cache's back: the board only shows it once it has been rebuilt
  await page.evaluate(() => (window as any).__bridge.enqueue("MATCH (p:Player) SET p.steps = 3"));
  const before = JSON.parse(await snapshot(page));
  expect(before.player.steps).not.toBe(3);
  const version = await page.evaluate(() => (window as any).__state.version);
  // a statement with about a thousand nested parentheses traps the engine (ADR-001); the core replaces the instance
  await page.evaluate(() => {
    const trap = `RETURN ${"(".repeat(1000)}1${")".repeat(1000)}`;
    return (window as any).__bridge.enqueue(trap).then(() => "ran", (e: Error) => e.name);
  });
  // the board matches the graph once the new instance has answered (a loop in the page: waitForFunction does not wait on a promise)
  await page.evaluate(async (v) => {
    const w = window as any;
    for (const deadline = Date.now() + 60_000; Date.now() < deadline; await new Promise((r) => setTimeout(r, 100))) {
      try {
        const rows = await w.__bridge.enqueue("MATCH (p:Player) RETURN p.steps AS steps");
        if (w.__state.version > v && w.__state.pending === null && rows[0].steps === w.__state.player.steps) return;
      } catch {
        /* the instance is still being replaced */
      }
    }
    throw new Error("the board did not match the graph within 60 s");
  }, version);
  const after = JSON.parse(await snapshot(page));
  expect(after.tiles).toEqual(before.tiles); // the same board
  // A durable store keeps the write across the replacement, and the rebuilt board shows it (once). WebKit in a fresh,
  // non-persistent profile has no durable store (ADR-009), so the graph is seeded again and the board matches that.
  if (info.project.name !== "webkit") expect(after.player.steps).toBe(3);
});

test("the splash's throwaway world leaves the saved game as it was", async ({ page }) => {
  await page.goto("/?play=1&reset=1");
  await loaded(page);
  const saved = await snapshot(page);
  await page.goto("/"); // the splash, with the demo world behind it
  await loaded(page);
  await page.waitForFunction(() => typeof (window as any).__demoScene === "function" && (window as any).__demoScene() !== undefined);
  await page.waitForTimeout(3000); // the demo's explorer walks and clears fog in its own graph
  expect(await snapshot(page)).toBe(saved);
  await page.goto("/?play=1"); // back in the game: the saved world is the one played before
  await loaded(page);
  expect(await snapshot(page)).toBe(saved);
});
