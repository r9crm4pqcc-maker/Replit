import fs from "node:fs";
import table from "../src/lib/sports-rules.json" with { type: "json" };

const rows = fs.readFileSync("/tmp/feat-games.jsonl", "utf8").trim().split("\n").map((l) => JSON.parse(l));
const train = rows.filter((r) => r.y < 2016);
const val = rows.filter((r) => r.y >= 2016 && r.y < 2020);
const test = rows.filter((r) => r.y >= 2020);
console.log("rows", rows.length, "train", train.length, "val", val.length, "test", test.length);

const keys = [...new Set(rows.flatMap((r) => Object.keys(r.f)))].sort();
const idx = Object.fromEntries(keys.map((k, i) => [k, i]));
const REC = { 15: keys.length, 30: keys.length + 1, 40: keys.length + 2, 50: keys.length + 3 };
const MARGIN = keys.length + 4;
const HOME = keys.length + 5;
const DIM = keys.length + 6;

function pack(list) {
  return list.map((r) => {
    const ix = [];
    const vx = [];
    for (const [k, v] of Object.entries(r.f)) if (v) { ix.push(idx[k]); vx.push(v); }
    if (r.b && r.s) { ix.push(REC[r.b]); vx.push(r.s); }
    if (r.d) { ix.push(MARGIN); vx.push(r.d); }
    ix.push(HOME); vx.push(1);
    return { a: r.a, ix, vx };
  });
}
const P = { train: pack(train), val: pack(val), test: pack(test), all: pack(rows) };

function scoreOf(w, row) {
  let s = 0;
  for (let i = 0; i < row.ix.length; i++) s += (w[row.ix[i]] || 0) * row.vx[i];
  return s;
}
function acc(w, list) {
  let h = 0;
  for (const row of list) {
    const s = scoreOf(w, row);
    const pick = s >= 0 ? 1 : 0;
    if (pick === row.a) h++;
  }
  return list.length ? h / list.length : 0;
}
const pct = (x) => Math.round(x * 1000) / 10;

const current = new Float64Array(DIM);
for (const [k, v] of Object.entries(table)) if (k in idx) current[idx[k]] = v.weight ?? 0;
for (const k of keys) if (!(k in table)) current[idx[k]] = 1;
current[REC[15]] = 2.31; current[REC[30]] = 4.04; current[REC[40]] = 4.72; current[REC[50]] = 5.9;

const bands = { 15: [0, 0], 30: [0, 0], 40: [0, 0], 50: [0, 0], none: [0, 0] };
for (const r of rows) {
  const slot = r.b ? bands[r.b] : bands.none;
  slot[1]++;
  if (r.b) { if ((r.s > 0 ? 1 : 0) === r.a) slot[0]++; }
  else if (r.a === 1) slot[0]++;
}
console.log("bands", Object.fromEntries(Object.entries(bands).map(([k, v]) => [k, { n: v[1], pct: v[1] ? pct(v[0] / v[1]) : 0 }])));
console.log("current", { all: pct(acc(current, P.all)), train: pct(acc(current, P.train)), val: pct(acc(current, P.val)), test: pct(acc(current, P.test)) });

function fitLogistic(src, l2, epochs) {
  const w = new Float64Array(DIM);
  const lr = 0.15;
  for (let e = 0; e < epochs; e++) {
    const g = new Float64Array(DIM);
    for (const row of src) {
      const s = scoreOf(w, row);
      const p = 1 / (1 + Math.exp(-Math.max(-20, Math.min(20, s))));
      const err = p - row.a;
      for (let i = 0; i < row.ix.length; i++) g[row.ix[i]] += err * row.vx[i];
    }
    for (let i = 0; i < DIM; i++) w[i] -= lr * (g[i] / src.length + l2 * w[i]);
  }
  return w;
}

let best = { name: "current", w: current, val: acc(current, P.val) };
function consider(name, w) {
  const v = acc(w, P.val);
  console.log(name, "val", pct(v), "train", pct(acc(w, P.train)));
  if (v > best.val + 0.0003) best = { name, w, val: v };
}

for (const l2 of [0, 0.0005, 0.002, 0.01]) {
  consider("logistic-" + l2, fitLogistic(P.train, l2, 25));
}

const scales = [0, 0.25, 0.5, 1, 1.5];
const homes = [0, 0.05, 0.1, 0.2, 0.35, 0.5];
const margins = [0, 1, 2, 4, 8];
for (const a of scales) for (const h of homes) for (const m of margins) {
  const w = Float64Array.from(current, (x, i) => (i === HOME ? h : i === MARGIN ? m : i >= REC[15] && i <= REC[50] ? x : x * a));
  const v = acc(w, P.val);
  if (v > best.val + 0.0003) best = { name: `scale${a}-home${h}-margin${m}`, w, val: v };
}
console.log("best after grid", best.name, "val", pct(best.val));

const gridFor = (i) => {
  if (i >= REC[15] && i <= REC[50]) return [0, 0.5, 1, 2, 3, 4, 6, 8];
  if (i === MARGIN) return [0, 0.5, 1, 2, 4, 6];
  if (i === HOME) return [0, 0.05, 0.1, 0.15, 0.25, 0.4];
  return [-0.4, -0.2, 0, 0.1, 0.2, 0.4, 0.8];
};
let w = Float64Array.from(best.w);
for (let pass = 0; pass < 2; pass++) {
  for (let i = 0; i < DIM; i++) {
    let pick = w[i], pickAcc = acc(w, P.train);
    for (const c of gridFor(i)) {
      w[i] = c;
      const a = acc(w, P.train);
      if (a > pickAcc + 0.00005) { pickAcc = a; pick = c; }
    }
    w[i] = pick;
  }
  const v = acc(w, P.val);
  console.log("pass", pass, "train", pct(acc(w, P.train)), "val", pct(v));
  if (v > best.val) best = { name: "descent-" + pass, w: Float64Array.from(w), val: v };
  else w = Float64Array.from(best.w);
}

const named = {};
keys.forEach((k, i) => { if (Math.abs(best.w[i]) >= 0.02) named[k] = Math.round(best.w[i] * 100) / 100; });
named.record15 = Math.round(best.w[REC[15]] * 100) / 100;
named.record30 = Math.round(best.w[REC[30]] * 100) / 100;
named.record40 = Math.round(best.w[REC[40]] * 100) / 100;
named.record50 = Math.round(best.w[REC[50]] * 100) / 100;
named.margin = Math.round(best.w[MARGIN] * 100) / 100;
named.home = Math.round(best.w[HOME] * 100) / 100;
const report = {
  name: best.name,
  train: pct(acc(best.w, P.train)),
  val: pct(acc(best.w, P.val)),
  test: pct(acc(best.w, P.test)),
  all: pct(acc(best.w, P.all)),
  currentTest: pct(acc(current, P.test)),
  weights: named,
};
fs.writeFileSync("/tmp/fit-result.json", JSON.stringify(report, null, 2));
console.log(JSON.stringify(report, null, 2));
