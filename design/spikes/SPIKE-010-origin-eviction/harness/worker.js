// A dedicated worker with file operations on the origin-private root, for the catalog-file experiments.
import init, { RelateDb } from "/pkg/relate.js";

let db = null;
let stop = false;
const root = () => navigator.storage.getDirectory();
const enc = new TextEncoder();
const body = (gen, size) => { const pad = "x".repeat(size); return JSON.stringify({ gen, pad, check: size + ":" + gen }); };
const genOf = (t) => { try { const o = JSON.parse(t); return o.check === o.pad.length + ":" + o.gen ? o.gen : -1; } catch { return -1; } };
const fh = async (name, create) => (await root()).getFileHandle(name, { create });
const errName = (e) => (e && e.name ? e.name : String(e)).slice(0, 60);

const writers = {
  // Atomic swap file behind a writable stream: contents replace the file on close.
  async swap(name, text) {
    const h = await fh(name, true);
    const w = await h.createWritable();
    await w.write(text);
    await w.close();
  },
  // In place through a sync access handle: truncate, write, flush.
  async sync(name, text) {
    const h = await fh(name, true);
    const a = await h.createSyncAccessHandle();
    try { a.truncate(0); a.write(enc.encode(text), { at: 0 }); a.flush(); } finally { a.close(); }
  },
  // Write a temporary file (sync handle), then rename it over the target.
  async move(name, text) {
    const tmp = name + ".tmp";
    await writers.sync(tmp, text);
    const h = await fh(tmp, false);
    // Chromium and Firefox take (name); WebKit requires (directory, name).
    try { await h.move(name); } catch (e) { if (e instanceof TypeError) await h.move(await root(), name); else throw e; }
  },
};

const read = async (name) => (await (await fh(name, false)).getFile()).text();

const commands = {
  async init() { await init({ module_or_path: "/pkg/relate_bg.wasm" }); return {}; },
  async open({ name }) { db = await RelateDb.open(`opfs://${name}`); return {}; },
  exec({ q }) { const e = JSON.parse(db.execute(q, null)); if (e.error) throw new Error(e.error); return e; },
  // Recursive listing of the origin-private root: entries, files, bytes.
  async tree() {
    let dirs = 0, files = 0, bytes = 0; const top = [];
    const walk = async (d, depth) => {
      for await (const [n, h] of d.entries()) {
        if (depth === 0) top.push(n);
        if (h.kind === "directory") { dirs++; await walk(h, depth + 1); }
        else { files++; try { bytes += (await h.getFile()).size; } catch {} }
      }
    };
    await walk(await root(), 0);
    return { top, dirs, files, bytes };
  },
  async estimate() {
    const e = await navigator.storage.estimate();
    return { usage: e.usage, quota: e.quota, persisted: await navigator.storage.persisted(), onquotachange: "onquotachange" in navigator.storage };
  },
  async bucketWrite({ name, text }) {
    const b = await navigator.storageBuckets.open("catalog", { persisted: false });
    const d = await b.getDirectory();
    const h = await d.getFileHandle(name, { create: true });
    const w = await h.createWritable(); await w.write(text); await w.close();
    return { keys: await navigator.storageBuckets.keys() };
  },
  async bucketRead({ name }) {
    const keys = await navigator.storageBuckets.keys();
    const b = await navigator.storageBuckets.open("catalog", { persisted: false });
    const d = await b.getDirectory();
    const names = []; for await (const [n] of d.entries()) names.push(n);
    return { keys, names };
  },
  caps() {
    const P = typeof FileSystemFileHandle !== "undefined" ? FileSystemFileHandle.prototype : {};
    return {
      createWritable: "createWritable" in P,
      createSyncAccessHandle: "createSyncAccessHandle" in P,
      move: "move" in P,
      locks: typeof navigator.locks !== "undefined",
      storageBuckets: typeof navigator.storageBuckets !== "undefined",
    };
  },
  async write({ mode, name, text }) { await writers[mode](name, text); return {}; },
  async read({ name }) { return { text: await read(name) }; },
  async list() { const names = []; for await (const [n] of (await root()).entries()) names.push(n); return { names }; },
  async remove({ name }) { await (await root()).removeEntry(name, { recursive: true }); return {}; },
  // Writes `n` generations of a self-checking file of `size` bytes; with n = 0, runs until terminated.
  async loopWrite({ mode, name, n, size, lock }) {
    let done = 0; const errors = {};
    for (let i = 1; n === 0 || i <= n; i++) {
      try {
        if (lock) await navigator.locks.request("catalog", () => writers[mode](name, body(i, size))); else await writers[mode](name, body(i, size));
        done++;
      } catch (e) { errors[errName(e)] = (errors[errName(e)] ?? 0) + 1; }
    }
    return { done, errors };
  },
  async loopRead({ name, lock }) {
    stop = false;
    let reads = 0, torn = 0, tornEmpty = 0, missing = 0, backwards = 0, last = 0; const errors = {};
    while (!stop) {
      try {
        const text = lock ? await navigator.locks.request("catalog", { mode: "shared" }, () => read(name)) : await read(name);
        const g = genOf(text);
        reads++;
        if (g < 0) { torn++; if (text === "") tornEmpty++; } else { if (g < last) backwards++; last = g; }
      } catch (e) {
        if (e && e.name === "NotFoundError") missing++; else errors[errName(e)] = (errors[errName(e)] ?? 0) + 1;
      }
    }
    return { reads, torn, tornEmpty, missing, backwards, lastGen: last, errors };
  },
  stopRead() { stop = true; return {}; },
  // Counter file: read an integer, write it plus one; optionally inside a Web Lock.
  async incr({ mode, name, n, lock }) {
    let done = 0; const errors = {};
    const once = async () => { const v = parseInt(await read(name), 10) || 0; await writers[mode](name, String(v + 1)); };
    for (let i = 0; i < n; i++) {
      try {
        if (lock) await navigator.locks.request("catalog", once); else await once();
        done++;
      } catch (e) { errors[errName(e)] = (errors[errName(e)] ?? 0) + 1; }
    }
    return { done, errors };
  },
  // Takes a Web Lock and holds it until the worker ends.
  async holdLock({ name }) {
    await new Promise((resolve) => { navigator.locks.request(name, () => { resolve(); return new Promise(() => {}); }); });
    return { held: true };
  },
  async takeLock({ name }) {
    const t = performance.now();
    await navigator.locks.request(name, () => {});
    return { waitedMs: performance.now() - t };
  },
};

self.onmessage = async (e) => {
  const { id, cmd, args } = e.data;
  try { self.postMessage({ id, ok: true, val: await commands[cmd](args) }); }
  catch (err) { self.postMessage({ id, ok: false, err: String(err && err.message ? err.message : err) }); }
};
