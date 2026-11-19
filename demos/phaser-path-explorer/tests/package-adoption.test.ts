// covers-ph: FR-015, FR-016, SC-003
// The path explorer runs on @relate/contrib-phaser: it keeps no copy of the queue, and its board is rebuilt from the graph
// when the client moves to a new generation (the unit-level check; the browser run traps a real engine).
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { Bridge } from "@relate/contrib-phaser";
import { GameState } from "../src/game/state.js";
import { generateRows } from "../src/game/world.js";
import { engineBuilt, openEngine, seedWorld } from "./helpers/engine.js";

const src = resolve(fileURLToPath(new URL("../src", import.meta.url)));
const walk = (dir: string): string[] => readdirSync(dir, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? walk(join(dir, e.name)) : [join(dir, e.name)]));

describe("the path explorer on the package", () => {
  it("has no copy of the queue, and takes it, the cache and the throwaway client from the package", () => {
    expect(existsSync(join(src, "game/bridge.ts"))).toBe(false);
    const sources = walk(src).filter((f) => f.endsWith(".ts"));
    for (const f of sources) expect(readFileSync(f, "utf8"), f).not.toMatch(/from "\.{1,2}\/(game\/)?bridge\.js"/);
    const text = (name: string) => readFileSync(join(src, name), "utf8");
    expect(text("main.ts")).toMatch(/import \{[^}]*Bridge[^}]*createThrowawayClient[^}]*\} from "@relate\/contrib-phaser"/);
    expect(text("game/state.ts")).toContain("ReplyCache");
    expect(text("game/MapScene.ts")).toContain("versionWatch");
  });

  it.skipIf(!engineBuilt)("rebuilds the board from the graph when the client moves to a new generation", async () => {
    const engine = await openEngine();
    await seedWorld(engine, generateRows("first-light"));
    let onGeneration: ((g: number) => void | Promise<void>) | undefined;
    const client = {
      status: "ready" as const,
      generation: 1,
      query: engine.query,
      on: () => () => undefined,
      onGeneration: (l: (g: number) => void | Promise<void>) => {
        onGeneration = l;
        return () => undefined;
      },
    };
    const state = new GameState(new Bridge(engine.query), client as never);
    await state.load();
    const steps = state.player.steps;
    await engine.query("MATCH (p:Player) SET p.steps = $n", { n: steps - 5 }); // the restored graph differs from the cache
    expect(state.player.steps).toBe(steps);
    await onGeneration!(2);
    expect(state.player.steps).toBe(steps - 5);
    expect(state.tiles.size).toBeGreaterThan(0);
  });
});
