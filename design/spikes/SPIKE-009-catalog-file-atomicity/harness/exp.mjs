import { openPage, sleep } from "./lib.mjs";

const call = (page, key, cmd, args) => page.evaluate(([k, c, a]) => window.call(k, c, a), [key, cmd, args]).then((v) => ({ ok: true, v }), (e) => ({ ok: false, err: String(e.message).split("\n")[0].slice(0, 160) }));
const spawn = (page, key) => page.evaluate((k) => window.spawn(k), key);
const kill = (page, key) => page.evaluate((k) => window.kill(k), key);
const clear = (page) => page.evaluate(() => window.clearRoot());
const MODES = ["swap", "sync", "move"];

async function capsOf(page) {
  await spawn(page, "c");
  const w = await call(page, "c", "caps");
  const p = await page.evaluate(() => window.pageCaps());
  await kill(page, "c");
  return { worker: w.v ?? w, page: p };
}

// Which modes actually work for one write and one read here.
async function usable(page) {
  await spawn(page, "u");
  const out = {};
  for (const m of MODES) {
    const name = `probe-${m}.json`;
    const w = await call(page, "u", "write", { mode: m, name, text: "1" });
    const w2 = w.ok ? await call(page, "u", "write", { mode: m, name, text: "22" }) : w;
    const r = w2.ok ? await call(page, "u", "read", { name }) : w2;
    out[m] = w2.ok && r.ok && r.v.text === "22" ? "ok" : (w2.ok ? `read: ${r.err ?? r.v.text}` : w2.err);
  }
  await kill(page, "u");
  await clear(page);
  return out;
}

export async function e1(ctx) {
  const page = await openPage(ctx);
  await clear(page);
  const caps = await capsOf(page);
  const modes = await usable(page);
  await page.close();
  return { caps, modes };
}

// A second tab reads, lists and replaces a catalog file while the first holds an engine store.
export async function e2(ctx) {
  const p1 = await openPage(ctx);
  await clear(p1);
  const modes = await usable(p1);
  const mode = ["swap", "sync", "move"].find((m) => modes[m] === "ok");
  await spawn(p1, "holder");
  const init = await call(p1, "holder", "init");
  const open = await call(p1, "holder", "open", { name: "catalog-e2" });
  const create = await call(p1, "holder", "exec", { q: "CREATE (:Item {id: 1})" });
  const p2 = await openPage(ctx);
  await spawn(p2, "other");
  const out = { mode, holder: { init: init.ok, open: open.ok, create: create.ok ? "ok" : create.err } };
  out.write = await call(p2, "other", "write", { mode, name: "catalog.json", text: JSON.stringify({ graphs: ["a"] }) });
  out.read = await call(p2, "other", "read", { name: "catalog.json" });
  out.rewrite = await call(p2, "other", "write", { mode, name: "catalog.json", text: JSON.stringify({ graphs: ["a", "b"] }) });
  out.read2 = await call(p2, "other", "read", { name: "catalog.json" });
  out.list = await call(p2, "other", "list");
  // the held store still answers
  out.holderQuery = await call(p1, "holder", "exec", { q: "MATCH (n:Item) RETURN count(n)" }).then((r) => (r.ok ? "ok" : r.err));
  // a second open of the held store from tab 2
  await call(p2, "other", "init");
  out.secondOpen = await call(p2, "other", "open", { name: "catalog-e2" });
  await p2.close(); await kill(p1, "holder"); await sleep(300); await clear(p1); await p1.close();
  return out;
}

// A writer replaces a self-checking file many times while a reader in another tab reads in a loop.
export async function e3(ctx) {
  const p0 = await openPage(ctx);
  const modes = await usable(p0);
  await p0.close();
  const out = { modes };
  for (const mode of MODES) {
    if (modes[mode] !== "ok") { out[mode] = { skipped: modes[mode] }; continue; }
    const pw = await openPage(ctx), pr = await openPage(ctx);
    await clear(pw);
    await spawn(pw, "w"); await spawn(pr, "r");
    await call(pw, "w", "write", { mode, name: "catalog.json", text: JSON.stringify({ gen: 0, pad: "", check: "0:0" }) });
    const reading = call(pr, "r", "loopRead", { name: "catalog.json" });
    await sleep(100);
    const t = Date.now();
    const writing = await call(pw, "w", "loopWrite", { mode, name: "catalog.json", n: 300, size: 50000 });
    const ms = Date.now() - t;
    await call(pr, "r", "stopRead");
    const read = await reading;
    out[mode] = { write: writing.v ?? writing, writeMs: ms, read: read.v ?? read };
    await pw.close(); await pr.close();
  }
  return out;
}

// A writer is terminated mid-loop; what does the file and the directory hold afterwards?
export async function e4(ctx) {
  const p0 = await openPage(ctx);
  const modes = await usable(p0);
  await p0.close();
  const out = { modes };
  for (const mode of MODES) {
    if (modes[mode] !== "ok") { out[mode] = { skipped: modes[mode] }; continue; }
    const cycles = [];
    for (let i = 0; i < 20; i++) {
      const pw = await openPage(ctx);
      await clear(pw);
      await spawn(pw, "w");
      await call(pw, "w", "write", { mode, name: "catalog.json", text: JSON.stringify({ gen: 0, pad: "", check: "0:0" }) });
      call(pw, "w", "loopWrite", { mode, name: "catalog.json", n: 0, size: 50000 });
      await sleep(50 + Math.floor(Math.random() * 350));
      await kill(pw, "w");
      const t = Date.now();
      await spawn(pw, "r");
      let read = null;
      for (let a = 0; a < 60; a++) {
        read = await call(pw, "r", "read", { name: "catalog.json" });
        if (read.ok) break;
        await sleep(100);
      }
      const list = await call(pw, "r", "list");
      let valid = null;
      if (read.ok) { try { const o = JSON.parse(read.v.text); valid = o.check === o.pad.length + ":" + o.gen ? o.gen : "torn"; } catch { valid = "torn"; } }
      cycles.push({ readable: read.ok, readErr: read.ok ? undefined : read.err, waitMs: Date.now() - t, valid, entries: list.v?.names });
      await pw.close();
    }
    out[mode] = {
      cycles: cycles.length,
      unreadable: cycles.filter((c) => !c.readable).length,
      torn: cycles.filter((c) => c.valid === "torn").length,
      ok: cycles.filter((c) => typeof c.valid === "number").length,
      extraEntries: [...new Set(cycles.flatMap((c) => (c.entries ?? []).filter((n) => n !== "catalog.json")))],
      maxWaitMs: Math.max(...cycles.map((c) => c.waitMs)),
      errs: [...new Set(cycles.map((c) => c.readErr).filter(Boolean))],
    };
  }
  return out;
}

// Three tabs increment one counter file 100 times each, with and without a Web Lock.
export async function e5(ctx) {
  const p0 = await openPage(ctx);
  const modes = await usable(p0);
  await p0.close();
  const mode = ["swap", "move", "sync"].find((m) => modes[m] === "ok");
  const out = { mode };
  for (const lock of [false, true]) {
    const pages = [await openPage(ctx), await openPage(ctx), await openPage(ctx)];
    await clear(pages[0]);
    await spawn(pages[0], "init");
    await call(pages[0], "init", "write", { mode, name: "counter.txt", text: "0" });
    await kill(pages[0], "init");
    for (const [i, p] of pages.entries()) await spawn(p, `w${i}`);
    const t = Date.now();
    const rs = await Promise.all(pages.map((p, i) => call(p, `w${i}`, "incr", { mode, name: "counter.txt", n: 100, lock })));
    const ms = Date.now() - t;
    await spawn(pages[0], "r");
    const final = await call(pages[0], "r", "read", { name: "counter.txt" });
    out[lock ? "withLock" : "withoutLock"] = { final: final.v?.text, expected: rs.reduce((a, r) => a + (r.v?.done ?? 0), 0), results: rs.map((r) => r.v ?? r), ms };
    for (const p of pages) await p.close();
  }
  return out;
}

// A Web Lock held by a worker that is terminated, or whose tab closes: when does a waiter get it?
export async function e6(ctx) {
  const out = {};
  for (const how of ["terminate", "close"]) {
    const times = [];
    for (let i = 0; i < 5; i++) {
      const p1 = await openPage(ctx), p2 = await openPage(ctx);
      await spawn(p1, "h"); await spawn(p2, "t");
      const held = await call(p1, "h", "holdLock", { name: "e6" });
      if (!held.ok) { out[how] = { error: held.err }; await p1.close(); await p2.close(); break; }
      const waiting = call(p2, "t", "takeLock", { name: "e6" });
      await sleep(200);
      const t = Date.now();
      if (how === "terminate") await kill(p1, "h"); else await p1.close();
      const got = await waiting;
      times.push(got.ok ? Date.now() - t : got.err);
      await p2.close();
      if (!p1.isClosed()) await p1.close();
    }
    out[how] = out[how] ?? times;
  }
  return out;
}

// As E3, with writers holding an exclusive Web Lock around each replace and readers a shared one around each read.
export async function e7(ctx) {
  const out = {};
  for (const mode of ["swap", "sync", "move"]) {
    const pw = await openPage(ctx), pr = await openPage(ctx);
    await clear(pw);
    await spawn(pw, "w"); await spawn(pr, "r");
    await call(pw, "w", "write", { mode, name: "catalog.json", text: JSON.stringify({ gen: 0, pad: "", check: "0:0" }) });
    const reading = call(pr, "r", "loopRead", { name: "catalog.json", lock: true });
    await sleep(100);
    const writing = await call(pw, "w", "loopWrite", { mode, name: "catalog.json", n: 300, size: 50000, lock: true });
    await call(pr, "r", "stopRead");
    const read = await reading;
    out[mode] = { write: writing.v ?? writing, read: read.v ?? read };
    await pw.close(); await pr.close();
  }
  return out;
}
