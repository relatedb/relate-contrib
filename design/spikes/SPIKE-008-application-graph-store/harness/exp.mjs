// The spike's experiments. Each takes a Playwright context and returns plain data.
import { openPage, sleep } from "./lib.mjs";

const PAYLOAD = "x".repeat(100);

// Open a store in a fresh worker, retrying while it is locked. Runs inside the page.
const REOPEN = `
  window.reopen = async (key, name, limitMs = 20000) => {
    spawn(key);
    await call(key, { cmd: "init" });
    const t0 = performance.now(); let tries = 0, last = null;
    while (performance.now() - t0 < limitMs) {
      tries++;
      const o = await call(key, { cmd: "open", name });
      if (o.ok) return { ok: true, waitMs: Math.round(performance.now() - t0), tries };
      last = o.error;
      await new Promise((r) => setTimeout(r, 100));
    }
    return { ok: false, tries, error: last };
  };`;

async function fresh(context) {
  const page = await openPage(context);
  await page.addScriptTag({ content: REOPEN });
  await page.evaluate(() => clearOpfs());
  return page;
}

// E1: acknowledged writes survive a terminated worker and a closed page; no gaps.
export async function e1(context) {
  const out = { terminate: [], pageClose: [] };
  const page = await fresh(context);
  for (let c = 0; c < 5; c++) {
    const store = `e1-t${c}`;
    const delay = 300 + Math.floor(Math.random() * 1200);
    const acked = await page.evaluate(async ({ store, delay, payload }) => {
      spawn("w"); await call("w", { cmd: "init" }); await call("w", { cmd: "open", name: store });
      send("w", { cmd: "singles", from: 0, count: 200000, payload });
      await new Promise((r) => setTimeout(r, delay));
      kill("w");
      await new Promise((r) => setTimeout(r, 300));
      return completed("w");
    }, { store, delay, payload: PAYLOAD });
    const re = await page.evaluate(async ({ store }) => {
      const r = await reopen("v", store);
      if (!r.ok) return r;
      const s = await call("v", { cmd: "summary" });
      kill("v");
      return { ...r, row: s.row };
    }, { store });
    const row = re.row;
    out.terminate.push({ cycle: c, delay, completedByEngine: acked, recovered: row?.c, hi: row?.hi, lo: row?.lo, gapFree: row ? row.c === row.hi + 1 && row.lo === 0 : null, lostAcked: row ? acked > row.c : null, unlockWaitMs: re.waitMs, tries: re.tries, error: re.error });
  }
  await page.close();
  for (let c = 0; c < 3; c++) {
    const store = `e1-p${c}`;
    const p1 = await fresh(context);
    const delay = 300 + Math.floor(Math.random() * 1200);
    const acked = await p1.evaluate(async ({ store, delay, payload }) => {
      spawn("w"); await call("w", { cmd: "init" }); await call("w", { cmd: "open", name: store });
      send("w", { cmd: "singles", from: 0, count: 200000, payload });
      await new Promise((r) => setTimeout(r, delay));
      return completed("w");
    }, { store, delay, payload: PAYLOAD });
    await p1.close();
    const p2 = await openPage(context);
    await p2.addScriptTag({ content: REOPEN });
    const re = await p2.evaluate(async ({ store }) => {
      const r = await reopen("v", store);
      if (!r.ok) return r;
      const s = await call("v", { cmd: "summary" });
      return { ...r, row: s.row };
    }, { store });
    const row = re.row;
    out.pageClose.push({ cycle: c, delay, completedBeforeClose: acked, recovered: row?.c, hi: row?.hi, gapFree: row ? row.c === row.hi + 1 && row.lo === 0 : null, lostAcked: row ? acked > row.c : null, unlockWaitMs: re.waitMs, tries: re.tries, error: re.error });
    await p2.close();
  }
  return out;
}

// E3: what a second holder sees, and how long until the store is free.
export async function e3(context) {
  const out = {};
  const page = await fresh(context);
  out.sameTabSecondWorker = await page.evaluate(async () => {
    spawn("a"); await call("a", { cmd: "init" }); await call("a", { cmd: "open", name: "e3" });
    await call("a", { cmd: "singles", from: 0, count: 10, payload: "x" });
    spawn("b"); await call("b", { cmd: "init" });
    const o = await call("b", { cmd: "open", name: "e3" });
    return { ok: o.ok, error: o.error, ms: Math.round(o.ms) };
  });
  out.afterKill = await page.evaluate(async () => { kill("a"); kill("b"); const r = await reopen("c", "e3"); const s = r.ok ? await call("c", { cmd: "summary" }) : null; if (r.ok) kill("c"); return { ...r, row: s?.row }; });
  await page.close();

  // Two tabs: A holds the store idle; B is refused; A closes; B retries.
  const a = await fresh(context);
  await a.evaluate(async () => { spawn("a"); await call("a", { cmd: "init" }); await call("a", { cmd: "open", name: "e3b" }); await call("a", { cmd: "singles", from: 0, count: 10, payload: "x" }); });
  const b = await openPage(context);
  await b.addScriptTag({ content: REOPEN });
  out.twoTabsRefused = await b.evaluate(async () => reopen("b", "e3b", 1500));
  const t0 = Date.now();
  await a.close();
  const re = await b.evaluate(async () => { const r = await reopen("b2", "e3b", 20000); const s = r.ok ? await call("b2", { cmd: "summary" }) : null; return { ...r, row: s?.row }; });
  out.twoTabsAfterHolderClosed = { ...re, wallMsSinceClose: Date.now() - t0 };
  await b.close();
  return out;
}

// E2: growth, per-write cost and reopen time, for bulk and single-statement writes.
export async function e2(context, { bulkTotals = [1000, 5000, 20000, 50000, 100000], singlesTotal = 20000 } = {}) {
  const out = { bulk: [], singles: null };
  const page = await fresh(context);
  let have = 0;
  for (const total of bulkTotals) {
    const r = await page.evaluate(async ({ store, have, total, payload }) => {
      const o = await reopen("w", store);
      if (!o.ok) return { error: o.error };
      const t = performance.now();
      const s0 = have ? await call("w", { cmd: "summary" }) : null;
      const summaryMs = Math.round(performance.now() - t);
      const w = await call("w", { cmd: "bulk", from: have, total: total - have, per: 500, payload });
      const s = await call("w", { cmd: "summary" });
      kill("w");
      return { reopenMs: o.waitMs, summaryMsAtOpen: have ? summaryMs : null, countAtOpen: s0?.row?.c ?? 0, writeOk: w.ok, writeError: w.error, writeMs: Math.round(w.ms), perStatement: w.stats, count: s.row?.c };
    }, { store: "e2-bulk", have, total, payload: PAYLOAD });
    await sleep(500);
    let bytes = null;
    for (let i = 0; i < 20 && !bytes; i++) { try { bytes = await page.evaluate(() => opfsBytes()); } catch { await sleep(300); } }
    out.bulk.push({ total, ...r, opfsBytes: bytes?.t, opfsFiles: bytes?.files });
    if (r.error || !r.writeOk) break;
    have = total;
  }
  const s = await page.evaluate(async ({ store, total, payload }) => {
    const o = await reopen("w", store);
    const w = await call("w", { cmd: "singles", from: 0, count: total, payload });
    const s = await call("w", { cmd: "summary" });
    kill("w");
    return { writeOk: w.ok, error: w.error, totalMs: Math.round(w.ms), first1000: w.first, last1000: w.last, count: s.row?.c };
  }, { store: "e2-singles", total: singlesTotal, payload: PAYLOAD });
  await sleep(500);
  let bytes = null;
  for (let i = 0; i < 20 && !bytes; i++) { try { bytes = await page.evaluate(() => opfsBytes()); } catch { await sleep(300); } }
  const re = await page.evaluate(async ({ store }) => { const o = await reopen("v", store); const t = performance.now(); const s = await call("v", { cmd: "summary" }); return { reopenMs: o.waitMs, summaryMs: Math.round(performance.now() - t), count: s.row?.c }; }, { store: "e2-singles" });
  out.singles = { total: singlesTotal, ...s, ...re, opfsBytesAllStores: bytes?.t, opfsFilesAllStores: bytes?.files };
  await page.close();
  return out;
}

// E4: which values the engine stores and what they look like on the wire, for judging export in the graph data format.
const VALUES = [
  ["int-small", "42"],
  ["int-big", "9007199254740993"],
  ["int-max", "9223372036854775807"],
  ["float", "1.5"],
  ["float-whole", "2.0"],
  ["float-nan", "0.0/0.0"],
  ["string-unicode", "'héllo ✓ 𝄞'"],
  ["string-empty", "''"],
  ["bool", "true"],
  ["null", "null"],
  ["date", "date('2026-11-08')"],
  ["datetime", "datetime('2026-11-08T10:00:00Z')"],
  ["duration", "duration('P1D')"],
  ["point-wgs84", "point({latitude: 45.5, longitude: -122.6})"],
  ["list-int", "[1, 2, 3]"],
  ["list-float", "[1.5, 2.5]"],
  ["list-mixed", "[1, 2.5]"],
  ["list-string", "['a', 'b']"],
  ["list-empty", "[]"],
  ["list-of-lists", "[[1], [2]]"],
  ["map", "{a: 1}"],
];
export async function e4(context) {
  const page = await fresh(context);
  const out = await page.evaluate(async (values) => {
    spawn("w"); await call("w", { cmd: "init" }); await call("w", { cmd: "open", name: "e4" });
    const rows = [];
    for (const [k, lit] of values) {
      const c = await call("w", { cmd: "exec", q: `CREATE (:V {k: '${k}', p: ${lit}})` });
      let wire = null, types = null, readErr = null;
      if (c.ok) {
        const r = await call("w", { cmd: "raw", q: `MATCH (n:V {k: '${k}'}) RETURN n.p AS v` });
        if (r.ok) { const env = JSON.parse(r.text); wire = r.text.match(/"rows":(\[.*?\])\s*[,}]/s)?.[1] ?? r.text.slice(0, 200); types = env.column_types ?? env.columnTypes ?? null; readErr = env.error; }
      }
      rows.push({ k, lit, createOk: c.ok, createError: c.error, wire, types, readErr });
    }
    return rows;
  }, VALUES);
  await page.close();
  return out;
}

// E5: store names and isolation between stores on one origin.
export async function e5(context) {
  const page = await fresh(context);
  const out = await page.evaluate(async () => {
    const res = {};
    const tryName = async (label, name) => { spawn("n" + label); await call("n" + label, { cmd: "init" }); const o = await call("n" + label, { cmd: "open", name }); res["name:" + label] = { ok: o.ok, error: o.error }; kill("n" + label); };
    await tryName("64chars", "a".repeat(64));
    await tryName("65chars", "a".repeat(65));
    await tryName("dot", "a.b");
    await tryName("space", "a b");
    await tryName("empty", "");
    await tryName("dash-underscore", "My_App-1");
    spawn("a"); spawn("b");
    await call("a", { cmd: "init" }); await call("b", { cmd: "init" });
    const oa = await call("a", { cmd: "open", name: "iso-a" });
    const ob = await call("b", { cmd: "open", name: "iso-b" });
    await call("a", { cmd: "singles", from: 0, count: 5, payload: "x" });
    const sa = await call("a", { cmd: "summary" }), sb = await call("b", { cmd: "summary" });
    res.isolation = { openA: oa.ok, openB: ob.ok, countA: sa.row?.c, countB: sb.row?.c };
    return res;
  });
  await page.close();
  return out;
}

// E6: migration statements over a stored graph, their cost, and atomicity when the worker is terminated in the middle.
export async function e6(context) {
  const page = await fresh(context);
  const out = await page.evaluate(async (payload) => {
    const res = {};
    spawn("w"); await call("w", { cmd: "init" }); await call("w", { cmd: "open", name: "e6" });
    await call("w", { cmd: "bulk", from: 0, total: 50000, per: 500, payload });
    const time = async (label, q) => { const r = await call("w", { cmd: "exec", q }); res[label] = { ok: r.ok, ms: Math.round(r.ms), error: r.error }; };
    await time("addProperty", "MATCH (n:Item) SET n.v2 = n.id * 2");
    await time("renameProperty", "MATCH (n:Item) SET n.body = n.payload REMOVE n.payload");
    await time("relabel", "MATCH (n:Item) REMOVE n:Item SET n:Entry");
    await time("versionMarker", "MERGE (m:Meta {k: 'schema'}) SET m.version = 2");
    kill("w");
    // Atomicity: start a long single statement and terminate it shortly after.
    const r2 = await reopen("x", "e6");
    const before = await call("x", { cmd: "exec", q: "MATCH (n:Entry) RETURN count(n) AS c, count(n.v3) AS v3" });
    send("x", { cmd: "exec", q: "MATCH (n:Entry) SET n.v3 = n.id + 1" });
    await new Promise((r) => setTimeout(r, 25));
    kill("x");
    const r3 = await reopen("y", "e6", 30000);
    const after = r3.ok ? await call("y", { cmd: "exec", q: "MATCH (n:Entry) RETURN count(n) AS c, count(n.v3) AS v3" }) : null;
    res.killedMidMigration = { reopen: r3, before: before.env?.rows?.[0], after: after?.env?.rows?.[0] };
    return res;
  }, PAYLOAD);
  await page.close();
  return out;
}

// E7: storage estimate and persistence grant as the browser reports them.
export async function e7(context) {
  const page = await fresh(context);
  const out = await page.evaluate(async () => {
    const est = await navigator.storage.estimate();
    const before = await navigator.storage.persisted();
    let granted = null, err = null;
    try { granted = await Promise.race([navigator.storage.persist(), new Promise((r) => setTimeout(() => r("no answer in 3 s"), 3000))]); } catch (e) { err = String(e); }
    const after = await navigator.storage.persisted();
    return { quotaMB: Math.round((est.quota ?? 0) / 1e6), usageMB: Math.round((est.usage ?? 0) / 1e6), persistedBefore: before, persistReturned: granted, persistError: err, persistedAfter: after, ua: navigator.userAgent.slice(0, 80) };
  });
  await page.close();
  return out;
}

// E2 at larger sizes: where do growth, reopen time or a limit show up?
export const e2big = (context) => e2(context, { bulkTotals: [200000, 500000, 1000000, 2000000], singlesTotal: 200000 });

// E6 at a size where one statement runs for a second or more: is a terminated migration all-or-nothing?
export async function e6big(context) {
  const out = [];
  const page = await fresh(context);
  for (const killAfter of [100, 400]) {
    const r = await page.evaluate(async ({ payload, killAfter }) => {
      const store = "e6big-" + killAfter;
      spawn("w"); await call("w", { cmd: "init" }); await call("w", { cmd: "open", name: store });
      await call("w", { cmd: "bulk", from: 0, total: 300000, per: 500, payload });
      const full = await call("w", { cmd: "exec", q: "MATCH (n:Item) SET n.v2 = n.id RETURN count(n) AS c" });
      const fullMs = Math.round(full.ms);
      await call("w", { cmd: "exec", q: "MATCH (n:Item) REMOVE n.v2" });
      kill("w");
      const o = await reopen("x", store);
      const t = performance.now();
      send("x", { cmd: "exec", q: "MATCH (n:Item) SET n.v3 = n.id + 1" });
      await new Promise((r) => setTimeout(r, killAfter));
      const killedAt = Math.round(performance.now() - t);
      kill("x");
      const r3 = await reopen("y", store, 30000);
      const after = r3.ok ? await call("y", { cmd: "exec", q: "MATCH (n:Item) RETURN count(n) AS c, count(n.v3) AS v3" }) : null;
      return { killAfterMs: killAfter, fullStatementMs: fullMs, killedAtMs: killedAt, unlock: r3, after: after?.env?.rows?.[0] };
    }, { payload: PAYLOAD, killAfter });
    out.push(r);
  }
  await page.close();
  return out;
}

// E6 follow-up: the same terminated migration written with a WHERE clause (not the engine's batched "global bulk" shape),
// and as an explicit batch driven by the caller in id ranges.
export async function e6where(context) {
  const page = await fresh(context);
  const out = await page.evaluate(async (payload) => {
    const res = {};
    spawn("w"); await call("w", { cmd: "init" }); await call("w", { cmd: "open", name: "e6where" });
    await call("w", { cmd: "bulk", from: 0, total: 300000, per: 500, payload });
    kill("w");
    const o = await reopen("x", "e6where");
    const t = performance.now();
    send("x", { cmd: "exec", q: "MATCH (n:Item) WHERE n.id >= 0 SET n.v3 = n.id + 1" });
    await new Promise((r) => setTimeout(r, 400));
    kill("x");
    const r3 = await reopen("y", "e6where", 30000);
    const after = r3.ok ? await call("y", { cmd: "exec", q: "MATCH (n:Item) RETURN count(n) AS c, count(n.v3) AS v3" }) : null;
    res.whereClauseKilledAt400ms = { unlock: r3, after: after?.env?.rows?.[0] };
    // Ranges of 10,000 ids, each its own statement, with the version marker written last.
    const t2 = performance.now();
    let steps = 0;
    for (let lo = 0; lo < 300000; lo += 10000) { const r = await call("y", { cmd: "exec", q: "MATCH (n:Item) WHERE n.id >= $lo AND n.id < $hi AND n.v3 IS NULL SET n.v3 = n.id + 1", p: { lo, hi: lo + 10000 } }); if (!r.ok) { res.rangeError = r.error; break; } steps++; }
    res.rangeMigration = { steps, ms: Math.round(performance.now() - t2) };
    const fin = await call("y", { cmd: "exec", q: "MATCH (n:Item) RETURN count(n) AS c, count(n.v3) AS v3" });
    res.afterRanges = fin.env?.rows?.[0];
    return res;
  }, PAYLOAD);
  await page.close();
  return out;
}
