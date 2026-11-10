import { openPage, sleep } from "./lib.mjs";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const call = (page, key, cmd, args) => page.evaluate(([k, c, a]) => window.call(k, c, a), [key, cmd, args]).then((v) => ({ ok: true, v }), (e) => ({ ok: false, err: String(e.message).split("\n")[0].slice(0, 160) }));
const spawn = (page, key) => page.evaluate((k) => window.spawn(k), key);
const kill = (page, key) => page.evaluate((k) => window.kill(k), key);
const clearRoot = (page) => page.evaluate(() => window.clearRoot());
const PKG = fileURLToPath(new URL("../../../../vendor/relate-wasm/pkg", import.meta.url));

export async function e1(ctx) {
  const page = await openPage(ctx);
  await spawn(page, "a");
  await call(page, "a", "init");
  const api = await call(page, "a", "api");
  await kill(page, "a");
  await page.close();
  const dts = readFileSync(`${PKG}/relate.d.ts`, "utf8") + readFileSync(`${PKG}/opfs.d.ts`, "utf8");
  const words = ["list", "size", "metadata", "checkpoint", "catalog", "stat", "exists", "delete", "remove", "destroy", "drop"];
  const hits = Object.fromEntries(words.map((w) => [w, [...dts.matchAll(new RegExp(`^.*${w}.*$`, "gim"))].map((m) => m[0].trim().slice(0, 100)).slice(0, 4)]));
  return { api: api.v ?? api, dtsKeywordHits: hits };
}

// Stores of different size under three names: what the directory shows.
export async function e2(ctx) {
  const page = await openPage(ctx);
  await clearRoot(page);
  const out = {};
  const plan = [["rel-a", 0], ["app-b", 1000], ["other", 20000]];
  for (const [name, n] of plan) {
    await spawn(page, "w");
    await call(page, "w", "init");
    await call(page, "w", "open", { name });
    for (let i = 0; i < n; i += 500) {
      const batch = Math.min(500, n - i);
      await call(page, "w", "exec", { q: `UNWIND range(${i}, ${i + batch - 1}) AS i CREATE (:Item {id: i, payload: '${"x".repeat(100)}'})` });
    }
    await kill(page, "w");
    await sleep(500);
  }
  await spawn(page, "l");
  const lay = await call(page, "l", "layout");
  const est = await call(page, "l", "estimate");
  await kill(page, "l");
  out.layout = lay.v ?? lay;
  out.estimate = est.v ?? est;
  out.sumBytes = (lay.v?.stores ?? []).reduce((a, s) => a + s.bytes, 0);
  await page.close();
  return out;
}

// Listing cost with 1, 10 and 100 stores, in a worker and on the page.
export async function e4(ctx) {
  const page = await openPage(ctx);
  await clearRoot(page);
  const out = {};
  let have = 0;
  for (const target of [1, 10, 100]) {
    await spawn(page, "m");
    await call(page, "m", "init");
    const made = await call(page, "m", "makeStores", { prefix: `s${have}-`, count: target - have });
    await kill(page, "m");
    await sleep(500);
    have = target;
    await spawn(page, "l");
    const w = [];
    for (let i = 0; i < 3; i++) w.push((await call(page, "l", "layout")).v?.ms);
    const stores = (await call(page, "l", "layout")).v?.stores?.length;
    await kill(page, "l");
    const p = [];
    for (let i = 0; i < 3; i++) p.push((await page.evaluate(() => window.pageLayout())).ms);
    out[target] = { made: made.ok ? "ok" : made.err, stores, workerMs: w, pageMs: p };
  }
  await page.close();
  return out;
}

// Layout read while one store is held open by another worker.
export async function e5(ctx) {
  const page = await openPage(ctx);
  await clearRoot(page);
  await spawn(page, "m");
  await call(page, "m", "init");
  await call(page, "m", "makeStores", { prefix: "h-", count: 3 });
  await kill(page, "m");
  await sleep(500);
  await spawn(page, "hold");
  await call(page, "hold", "init");
  await call(page, "hold", "open", { name: "h-1" });
  await call(page, "hold", "exec", { q: "CREATE (:Item {id: 2})" });
  await spawn(page, "l");
  const lay = await call(page, "l", "layout");
  const pageLay = await page.evaluate(() => window.pageLayout());
  await kill(page, "l"); await kill(page, "hold");
  await page.close();
  return { layout: lay.v ?? lay, pageLayout: pageLay };
}
