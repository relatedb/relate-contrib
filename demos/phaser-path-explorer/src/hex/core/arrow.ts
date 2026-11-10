// The design system's arrow notation (`Arrow`): a form such as `->`, `=>`, `~>` or `<->` typed as characters, each
// character one fragment, drawn on a 64-unit tile with the centreline at y = 32 and one character 32 wide. A port of
// `arrowGeometry`, line for line: the path text it returns is compared with the design system's own in the tests.
//   -  a single shaft     =  a double shaft     ~  a wavy shaft (the first of these sets the style)
//   >  <  open chevrons, a head at the end or a tail at the start     |  ||  bars     /  !  :  marks     o  a dot

export interface ArrowGeometry {
  /** Width of the tile in arrow units. */
  W: number;
  /** SVG path data (M, H, L, Q only) in arrow units. */
  d: string;
  /** Filled dots as [cx, cy, r]. */
  dots: [number, number, number][];
}

interface Cell {
  t: string;
  a: number;
  b: number;
}

export function arrowGeometry(form: string, sw: number): ArrowGeometry {
  const T = 32;
  const cy = 32;
  const L = sw * 3.5;
  const g = sw * 1.25;
  const bh = sw * 3;
  const miter = sw * 0.71;
  const matched = String(form).match(/\|\||[<>|/!:~=\-o]/g) ?? ["-", ">"];
  const toks = matched.map((t, i, all) => ((t === ">" || t === "<") && i > 0 && i < all.length - 1 ? "-" : t));
  let style = "line";
  for (let i = 0; i < toks.length; i++) {
    if (toks[i] === "=") style = "double";
    if (toks[i] === "~") style = "wavy";
    if (toks[i] === "=" || toks[i] === "~" || toks[i] === "-") break;
  }
  const cells: Cell[] = [];
  let x = 0;
  toks.forEach((t) => {
    const n = t === "||" ? 2 : 1;
    cells.push({ t, a: x, b: x + n * T });
    x += n * T;
  });
  const W = x;
  const rows = style === "double" ? [cy - g, cy + g] : [cy];
  const iv = new Map<number, [number, number][]>();
  const ops: string[] = [];
  const dots: [number, number, number][] = [];
  rows.forEach((y) => iv.set(y, []));
  const first = cells[0]!;
  const last = cells[cells.length - 1]!;
  let xs0 = 0;
  let xs1 = W;
  if (first.t === "|") xs0 = first.a + sw / 2;
  else if (first.t === "||") xs0 = first.a + sw / 2;
  else if (first.t === "o") xs0 = first.a + bh * 0.65;
  if (last.t === "|" || last.t === "||") xs1 = W - sw / 2;
  const bar = (bx: number) => ops.push("M" + bx + " " + (cy - bh) + "V" + (cy + bh));
  cells.forEach((c, ci) => {
    const t = c.t;
    const mid = (c.a + c.b) / 2;
    const a = c.a;
    const b = c.b;
    let tipx = 0;
    const ra = new Map<number, number>();
    const rb = new Map<number, number>();
    rows.forEach((y) => {
      ra.set(y, a);
      rb.set(y, b);
    });
    if (t === ">") {
      tipx = c.b - miter;
      ops.push("M" + (tipx - L) + " " + (cy - L) + "L" + tipx + " " + cy + "L" + (tipx - L) + " " + (cy + L));
      rows.forEach((y) => {
        const dy = Math.abs(y - cy);
        rb.set(y, dy < 0.1 ? (ci === cells.length - 1 ? tipx : c.b) : tipx - dy);
      });
    } else if (t === "<") {
      tipx = c.a + miter;
      ops.push("M" + (tipx + L) + " " + (cy - L) + "L" + tipx + " " + cy + "L" + (tipx + L) + " " + (cy + L));
      rows.forEach((y) => {
        const dy = Math.abs(y - cy);
        ra.set(y, dy < 0.1 ? (ci === 0 ? tipx : c.a) : tipx + dy);
      });
    } else if (t === "|") {
      bar(ci === 0 ? c.a + sw / 2 : ci === cells.length - 1 ? c.b - sw / 2 : mid);
    } else if (t === "||") {
      const gap = sw * 2;
      if (ci === 0) {
        bar(c.a + sw / 2);
        bar(c.a + sw / 2 + gap);
      } else if (ci === cells.length - 1) {
        bar(c.b - sw / 2 - gap);
        bar(c.b - sw / 2);
      } else {
        bar(mid - gap / 2);
        bar(mid + gap / 2);
      }
    } else if (t === "/") {
      ops.push("M" + (mid - bh * 0.6) + " " + (cy + bh) + "L" + (mid + bh * 0.6) + " " + (cy - bh));
    } else if (t === "!") {
      ops.push("M" + mid + " " + (cy - bh) + "V" + (cy + bh));
    } else if (t === ":") {
      dots.push([mid, cy, sw * 0.5]);
    } else if (t === "o") {
      dots.push([c.a + bh * 0.65, cy, bh * 0.65]);
    }
    rows.forEach((y) => {
      const x1 = Math.max(ra.get(y)!, xs0);
      const x2 = Math.min(rb.get(y)!, xs1);
      if (x2 <= x1) return;
      if (style === "wavy" && x2 - x1 >= 12) {
        const hf = (x2 - x1) / 2;
        const A = sw * 2;
        ops.push(
          "M" + x1 + " " + y + "Q" + (x1 + hf / 2) + " " + (y - A) + " " + (x1 + hf) + " " + y + "Q" + (x1 + hf * 1.5) + " " + (y + A) + " " + x2 + " " + y,
        );
      } else iv.get(y)!.push([x1, x2]);
    });
  });
  let d = "";
  rows.forEach((y) => {
    const l = iv.get(y)!.sort((p, q) => p[0] - q[0]);
    const m: [number, number][] = [];
    l.forEach((s) => {
      const z = m[m.length - 1];
      if (z && s[0] <= z[1] + 0.01) z[1] = Math.max(z[1], s[1]);
      else m.push([s[0], s[1]]);
    });
    m.forEach((s) => {
      d += "M" + s[0] + " " + y + "H" + s[1];
    });
  });
  return { W, d: d + ops.join(""), dots };
}

/**
 * Turn arrow path data into polylines (flat x, y lists). The path uses only M, H, V, L, Q and A; a curve is
 * sampled in `steps` straight pieces.
 */
export function pathPolylines(d: string, steps = 12): number[][] {
  const lines: number[][] = [];
  let cur: number[] = [];
  let x = 0;
  let y = 0;
  for (const m of d.matchAll(/([MHVLQA])([^MHVLQA]*)/g)) {
    const cmd = m[1]!;
    const n = m[2]!.trim().split(/\s+/).filter(Boolean).map(Number);
    if (cmd === "M") {
      if (cur.length) lines.push(cur);
      [x, y] = [n[0]!, n[1]!];
      cur = [x, y];
    } else if (cmd === "H") {
      x = n[0]!;
      cur.push(x, y);
    } else if (cmd === "V") {
      y = n[0]!;
      cur.push(x, y);
    } else if (cmd === "L") {
      [x, y] = [n[0]!, n[1]!];
      cur.push(x, y);
    } else if (cmd === "A") {
      // a circular arc: rx ry rotation large-arc sweep x y
      const [r, , , large, sweep, ex, ey] = [n[0]!, n[1]!, n[2]!, n[3]!, n[4]!, n[5]!, n[6]!];
      const dx = ex - x;
      const dy = ey - y;
      const chord = Math.hypot(dx, dy);
      const h = Math.sqrt(Math.max(0, r * r - (chord / 2) ** 2));
      const sign = sweep === 1 === (large === 0) ? 1 : -1;
      const cxc = (x + ex) / 2 + (sign * h * -dy) / chord;
      const cyc = (y + ey) / 2 + (sign * h * dx) / chord;
      const a0 = Math.atan2(y - cyc, x - cxc);
      let delta = Math.atan2(ey - cyc, ex - cxc) - a0;
      if (sweep === 1 && delta < 0) delta += 2 * Math.PI;
      if (sweep === 0 && delta > 0) delta -= 2 * Math.PI;
      for (let i = 1; i <= steps; i++) cur.push(cxc + r * Math.cos(a0 + (delta * i) / steps), cyc + r * Math.sin(a0 + (delta * i) / steps));
      [x, y] = [ex, ey];
    } else if (cmd === "Q") {
      const [cx, cyy, ex, ey] = [n[0]!, n[1]!, n[2]!, n[3]!];
      for (let i = 1; i <= steps; i++) {
        const t = i / steps;
        const u = 1 - t;
        cur.push(u * u * x + 2 * u * t * cx + t * t * ex, u * u * y + 2 * u * t * cyy + t * t * ey);
      }
      [x, y] = [ex, ey];
    }
  }
  if (cur.length) lines.push(cur);
  return lines;
}
