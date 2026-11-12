import fs from "node:fs";
const rows = JSON.parse(fs.readFileSync("/tmp/stack-rows.json", "utf8"));
const leagues = ["MLB", "NBA", "NFL", "NHL"];
function feats(r) {
  const eloHome = r.adj >= 0;
  return [
    1,
    Math.abs(r.adj) / 100,
    Math.abs(r.num),
    Math.abs(r.rec),
    Math.abs(r.num + r.rec),
    Math.abs(r.season),
    r.rest / 5,
    (r.num > 0) === (r.rec > 0) ? 1 : 0,
    ...leagues.map((l) => (r.league === l ? 1 : 0)),
  ];
}
const opp = rows.filter((r) => (r.num + r.rec) !== 0 && ((r.num + r.rec) > 0) !== (r.adj >= 0));
const label = (r) => (((r.num + r.rec) > 0) === !!r.homeWon ? 1 : 0);
console.log("overturns", opp.length, "good", opp.filter((r) => label(r)).length);
function split(list, a, b) { return list.filter((r) => r.y >= a && r.y < b); }
const train = split(opp, 0, 2016), val = split(opp, 2016, 2020), test = split(opp, 2020, 2100);
const dim = feats(opp[0]).length;
const w = new Float64Array(dim);
for (let ep = 0; ep < 40; ep++) {
  const g = new Float64Array(dim);
  for (const r of train) {
    const x = feats(r);
    let s = 0;
    for (let i = 0; i < dim; i++) s += w[i] * x[i];
    const p = 1 / (1 + Math.exp(-Math.max(-20, Math.min(20, s))));
    const err = p - label(r);
    for (let i = 0; i < dim; i++) g[i] += err * x[i];
  }
  for (let i = 0; i < dim; i++) w[i] -= 0.05 * (g[i] / train.length + 0.001 * w[i]);
}
function score(r) {
  const x = feats(r);
  let s = 0;
  for (let i = 0; i < dim; i++) s += w[i] * x[i];
  return 1 / (1 + Math.exp(-Math.max(-20, Math.min(20, s))));
}
function report(name, list, t) {
  let fixed = 0, broken = 0, n = 0;
  for (const r of list) {
    if (score(r) < t) continue;
    n++;
    if (label(r)) fixed++; else broken++;
  }
  console.log(name, "t", t, "n", n, "fixed", fixed, "broken", broken, "net", fixed - broken);
  return fixed - broken;
}
let bestT = 0.5, best = -1e9;
for (let t = 0.45; t <= 0.7; t += 0.01) {
  let fixed = 0, broken = 0;
  for (const r of val) if (score(r) >= t) { if (label(r)) fixed++; else broken++; }
  if (fixed - broken > best) { best = fixed - broken; bestT = Math.round(t * 100) / 100; }
}
console.log("val best", bestT, best);
report("test", test, bestT);
report("all", opp, bestT);
const good = opp.filter((r) => label(r));
const bad = opp.filter((r) => !label(r));
const avg = (list, f) => Math.round(list.reduce((s, r) => s + f(r), 0) / list.length * 100) / 100;
console.log("good n", good.length, "edge", avg(good, (r) => Math.abs(r.adj)), "vote", avg(good, (r) => Math.abs(r.num + r.rec)));
console.log("bad  n", bad.length, "edge", avg(bad, (r) => Math.abs(r.adj)), "vote", avg(bad, (r) => Math.abs(r.num + r.rec)));
