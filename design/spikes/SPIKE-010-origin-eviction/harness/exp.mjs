import { openPage, sleep, BASE } from "./lib.mjs";

const call = (page, key, cmd, args) => page.evaluate(([k, c, a]) => window.call(k, c, a), [key, cmd, args]).then((v) => ({ ok: true, v }), (e) => ({ ok: false, err: String(e.message).split("\n")[0].slice(0, 160) }));
const spawn = (page, key) => page.evaluate((k) => window.spawn(k), key);
const kill = (page, key) => page.evaluate((k) => window.kill(k), key);
const clearRoot = (page) => page.evaluate(() => window.clearRoot());
const ORIGIN = new URL(BASE).origin;

// Two engine stores with data and a catalog file; workers are ended so no store is held afterwards.
async function seed(page) {
  for (const [key, name, n] of [["s1", "rel-a", 5], ["s2", "app-b", 7]]) {
    await spawn(page, key);
    await call(page, key, "init");
    await call(page, key, "open", { name });
    for (let i = 0; i < n; i++) await call(page, key, "exec", { q: `CREATE (:Item {id: ${i}})` });
    await kill(page, key);
    await sleep(400);
  }
  await spawn(page, "cat");
  await call(page, "cat", "write", { mode: "swap", name: "catalog.json", text: JSON.stringify({ graphs: ["rel-a", "app-b"] }) });
  await kill(page, "cat");
}

async function state(page, key = "st") {
  await spawn(page, key);
  const tree = await call(page, key, "tree");
  const est = await call(page, key, "estimate");
  await kill(page, key);
  return { tree: tree.v ?? tree, estimate: est.v ?? est };
}

async function reopen(page, name) {
  await spawn(page, "ro");
  await call(page, "ro", "init");
  const open = await call(page, "ro", "open", { name });
  const count = open.ok ? await call(page, "ro", "exec", { q: "MATCH (n:Item) RETURN count(n) AS c" }) : open;
  await kill(page, "ro");
  await sleep(300);
  return open.ok ? { opened: true, rows: count.v?.rows ?? count.err } : { opened: false, err: open.err };
}

async function readCatalog(page) {
  await spawn(page, "rc");
  const r = await call(page, "rc", "read", { name: "catalog.json" });
  await kill(page, "rc");
  return r.ok ? r.v.text : r.err;
}

const clearOrigin = async (ctx, page, types = "file_systems") => {
  const cdp = await ctx.newCDPSession(page);
  const r = await cdp.send("Storage.clearDataForOrigin", { origin: ORIGIN, storageTypes: types });
  await cdp.detach();
  return r;
};

export async function e0(ctx) {
  const page = await openPage(ctx);
  const caps = await page.evaluate(() => window.pageCaps());
  await page.close();
  return caps;
}

// Clear the origin's file storage; what remains?
export async function e1(ctx) {
  const page = await openPage(ctx);
  await clearRoot(page);
  await seed(page);
  const before = await state(page);
  const beforeA = await reopen(page, "rel-a");
  await clearOrigin(ctx, page);
  await sleep(500);
  const after = await state(page, "st2");
  const catalog = await readCatalog(page);
  const afterA = await reopen(page, "rel-a");
  const afterB = await reopen(page, "app-b");
  await page.close();
  return { before, beforeA, after, catalog, afterA, afterB };
}

// Clear while a worker holds a store open.
export async function e2(ctx) {
  const page = await openPage(ctx);
  await clearRoot(page);
  await seed(page);
  await spawn(page, "h");
  await call(page, "h", "init");
  const open = await call(page, "h", "open", { name: "app-b" });
  const before = await call(page, "h", "exec", { q: "MATCH (n:Item) RETURN count(n) AS c" });
  const cleared = await clearOrigin(ctx, page).then(() => "ok", (e) => String(e.message).split("\n")[0]);
  await sleep(500);
  const write = await call(page, "h", "exec", { q: "CREATE (:Item {id: 99})" });
  const count = await call(page, "h", "exec", { q: "MATCH (n:Item) RETURN count(n) AS c" });
  const tree = await state(page, "st3");
  await kill(page, "h");
  await sleep(500);
  const reopened = await reopen(page, "app-b");
  const after = await state(page, "st4");
  await page.close();
  return { open: open.ok, before: before.v?.rows ?? before.err, cleared, holderWrite: write.ok ? "ok" : write.err, holderCount: count.ok ? count.v.rows : count.err, treeWhileHeld: tree, reopened, afterEnd: after };
}

// What can the page observe? usage before and after, and whether anything fires.
export async function e3(ctx) {
  const page = await openPage(ctx);
  await clearRoot(page);
  await seed(page);
  await page.evaluate(() => { window.events = []; });
  const before = await state(page);
  const t = Date.now();
  await clearOrigin(ctx, page);
  const after = await state(page, "st5");
  await sleep(1500);
  const later = await state(page, "st6");
  await page.close();
  return { before, after, later, clearedMs: Date.now() - t };
}

// A storage bucket: does the engine's root and a bucket's directory share fate?
export async function e4(ctx) {
  const page = await openPage(ctx);
  const caps = await page.evaluate(() => window.pageCaps());
  if (!caps.storageBuckets) { await page.close(); return { storageBuckets: false }; }
  await clearRoot(page);
  await seed(page);
  await spawn(page, "b");
  const written = await call(page, "b", "bucketWrite", { name: "catalog.json", text: "{}" });
  const before = await call(page, "b", "bucketRead", {});
  await clearOrigin(ctx, page);
  await sleep(500);
  const after = await call(page, "b", "bucketRead", {});
  const state2 = await state(page, "st7");
  await kill(page, "b");
  await page.close();
  return { storageBuckets: true, written, before, after, rootAfter: state2 };
}
