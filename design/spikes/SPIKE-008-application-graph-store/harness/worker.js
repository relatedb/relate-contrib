// A dedicated worker that holds one engine instance and runs the spike's commands.
import init, { RelateDb } from "/pkg/relate.js";

let db = null;
let ctr = null;
const now = () => performance.now();
const run = (q, p = null) => {
  const env = JSON.parse(db.execute(q, p === null ? null : JSON.stringify(p)));
  if (env.error) throw new Error(env.error);
  return env;
};
const stats = (xs) => {
  const s = [...xs].sort((a, b) => a - b);
  const at = (f) => s[Math.min(s.length - 1, Math.floor(f * s.length))];
  return { n: s.length, mean: xs.reduce((a, b) => a + b, 0) / Math.max(1, xs.length), p50: at(0.5), p95: at(0.95), max: s[s.length - 1] };
};

const commands = {
  async init() {
    await init({ module_or_path: "/pkg/relate_bg.wasm" });
    return {};
  },
  async open({ name }) {
    db = await RelateDb.open(`opfs://${name}`);
    return {};
  },
  attach({ sab }) {
    ctr = new Int32Array(sab);
    return {};
  },
  memory() {
    db = new RelateDb();
    return {};
  },
  exec({ q, p }) {
    return { env: run(q, p) };
  },
  raw({ q }) {
    return { text: db.execute(q, null) };
  },
  reset() {
    db.reset();
    return {};
  },
  // One statement per node, each acknowledged in turn. With ack, the loop posts the number it has finished.
  singles({ from, count, payload, ack }) {
    const times = [];
    for (let i = from; i < from + count; i++) {
      const t = now();
      run("CREATE (:Item {id: $i, payload: $p})", { i, p: payload });
      times.push(now() - t);
      if (ctr) Atomics.store(ctr, 0, i + 1);
      if (ack) postMessage({ type: "ack", i });
    }
    return { stats: stats(times), first: stats(times.slice(0, 1000)), last: stats(times.slice(-1000)) };
  },
  // `total` nodes written in statements of `per` nodes each.
  bulk({ from, total, per, payload }) {
    const times = [];
    for (let i = from; i < from + total; i += per) {
      const n = Math.min(per, from + total - i);
      const t = now();
      run("UNWIND range($a, $b) AS i CREATE (:Item {id: i, payload: $p})", { a: i, b: i + n - 1, p: payload });
      times.push(now() - t);
    }
    return { stats: stats(times) };
  },
  summary() {
    const env = run("MATCH (n:Item) RETURN count(n) AS c, min(n.id) AS lo, max(n.id) AS hi");
    return { row: env.rows[0] };
  },
};

onmessage = async (e) => {
  const m = e.data;
  const t = now();
  try {
    const out = await commands[m.cmd](m);
    postMessage({ id: m.id, ok: true, ms: now() - t, ...out });
  } catch (err) {
    postMessage({ id: m.id, ok: false, ms: now() - t, error: String((err && err.message) || err) });
  }
};
