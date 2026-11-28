// covers-obs: SC-003
// The cost of the feature when nobody uses it, measured in this process (one environment, one run: a figure, not a promise).
//  - the page: the work added to each statement is the write rule over the engine's counters;
//  - the worker: each statement it runs by itself is parsed once more, to count writes (the load of a 20,000-page graph is
//    the largest such run, here at 5,000 pages).
import { performance } from "node:perf_hooks";
import { describe, expect, it } from "vitest";
import { isWrite } from "../../../src/client/statements.js";
import { loadGraph, prepare } from "../../../src/worker/loader.js";
import { Engine } from "../../../src/worker/engine.js";
import { generateGraph } from "../../fixtures/generate-graph.js";
import { boot, client, newEngine, ready_ } from "./harness.js";

const median = (xs: number[]): number => [...xs].sort((a, b) => a - b)[Math.floor(xs.length / 2)]!;

describe("the cost with no listener", () => {
  it("adds under 2 % to a statement's round trip on the page", async () => {
    const c = await ready_(await client());
    const statement = "MATCH (n:Person) RETURN count(n) AS n";
    const runs: number[] = [];
    for (let r = 0; r < 5; r++) {
      const t = performance.now();
      for (let i = 0; i < 500; i++) await c.query(statement);
      runs.push((performance.now() - t) / 500);
    }
    c.destroy();
    const roundTrip = median(runs); // ms per statement, loopback transport and real engine
    const stats = { nodes_created: 0, nodes_deleted: 0, relationships_created: 0, relationships_deleted: 0, properties_set: 0, labels_added: 0, labels_removed: 0, indexes_added: 0, indexes_removed: 0, constraints_added: 0, constraints_removed: 0 };
    const t = performance.now();
    let sink = false;
    for (let i = 0; i < 200_000; i++) sink = isWrite(stats) || sink;
    const rule = (performance.now() - t) / 200_000; // ms per call
    console.log(`cost (this run, one environment): round trip ${(roundTrip * 1000).toFixed(1)} µs; write rule ${(rule * 1e6).toFixed(0)} ns; ${((rule / roundTrip) * 100).toFixed(3)} %`);
    expect(sink).toBe(false);
    expect(rule / roundTrip).toBeLessThan(0.02);
  });

  it("adds under 2 % to loading a graph of 5,000 pages in the worker (the tap that counts writes)", async () => {
    await boot();
    const checked = prepare(generateGraph(5_000).document);
    // the worker's tally parses each reply once, to read the counters
    const tally = (_statement: string, text: string): void => void (JSON.parse(text) as { stats?: unknown }).stats;
    const load = (tap: ((s: string, text: string) => void) | null): number => {
      const engine = newEngine();
      Engine.setTap(tap);
      const t = performance.now();
      loadGraph(engine, checked);
      const ms = performance.now() - t;
      Engine.setTap(null);
      return ms;
    };
    load(null); // warm up
    const off: number[] = [];
    const on: number[] = [];
    for (let i = 0; i < 3; i++) {
      off.push(load(null));
      on.push(load(tally));
    }
    const ratio = median(on) / median(off);
    console.log(`cost (this run, one environment): load of 5,000 pages ${median(off).toFixed(0)} ms without the tap, ${median(on).toFixed(0)} ms with it (${((ratio - 1) * 100).toFixed(1)} %)`);
    expect(ratio).toBeLessThan(1.02);
  }, 15_000);
});
