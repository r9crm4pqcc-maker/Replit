import fs from "node:fs";

const games = [];
for (const line of fs.readFileSync("/tmp/elo-games.jsonl", "utf8").split("\n")) {
  if (!line) continue;
  const [date, league, home, away, hs, as] = line.split("\t");
  const t = Date.parse(date);
  if (!Number.isFinite(t)) continue;
  games.push({ t, y: new Date(t).getUTCFullYear(), m: new Date(t).getUTCMonth() + 1, league, home, away, hs: +hs, as: +as });
}
games.sort((a, b) => a.t - b.t);

const opt = {
  k: { MLB: 4, NFL: 20, NHL: 14, NBA: 20 },
  home: { MLB: 28, NFL: 48, NHL: 35, NBA: 50 },
  b2b: { MLB: 0, NFL: 0, NHL: 25, NBA: 40 },
  regress: 0.2,
};
const startM = { MLB: 3, NFL: 8, NHL: 9, NBA: 9 };
const elo = new Map();
const last = new Map();
const seen = new Map();
const form = new Map();
const season = new Map();
const split = new Map();

function rec(map, key) {
  return map.get(key) ?? { w: 0, l: 0 };
}
function rate(r) {
  const n = r.w + r.l;
  return n ? r.w / n : null;
}
function pushForm(key, won) {
  const q = form.get(key) ?? [];
  q.push(won ? 1 : 0);
  if (q.length > 10) q.shift();
  form.set(key, q);
}
function lastN(key, n) {
  const q = form.get(key) ?? [];
  const s = q.slice(-n);
  if (s.length < n) return null;
  return s.reduce((a, b) => a + b, 0) / n;
}
function streak(key) {
  const q = form.get(key) ?? [];
  if (!q.length) return 0;
  const lastBit = q[q.length - 1];
  let n = 0;
  for (let i = q.length - 1; i >= 0 && q[i] === lastBit; i--) n++;
  return lastBit ? n : -n;
}

const rows = [];
for (const g of games) {
  const hk = g.league + "|" + g.home, ak = g.league + "|" + g.away;
  const seasonId = g.m >= startM[g.league] ? g.y : g.y - 1;
  const sk = g.league + "|" + seasonId;
  if (seen.get(g.league) !== sk) {
    seen.set(g.league, sk);
    for (const [k, v] of elo) if (k.startsWith(g.league + "|")) elo.set(k, v + (1500 - v) * opt.regress);
    for (const k of [...season.keys()]) if (k.startsWith(g.league + "|")) season.delete(k);
    for (const k of [...split.keys()]) if (k.startsWith(g.league + "|")) split.delete(k);
  }
  const he = elo.get(hk) ?? 1500, ae = elo.get(ak) ?? 1500;
  let adj = he + opt.home[g.league] - ae;
  const hd = last.get(hk) != null ? (g.t - last.get(hk)) / 86400000 : 7;
  const ad = last.get(ak) != null ? (g.t - last.get(ak)) / 86400000 : 7;
  if (hd < 1.4) adj -= opt.b2b[g.league];
  if (ad < 1.4) adj += opt.b2b[g.league];
  const homeWon = g.hs > g.as;
  const hs = rec(season, hk), as_ = rec(season, ak);
  const hh = rec(split, hk + "|H"), ar = rec(split, ak + "|R");
  rows.push({
    y: g.y, league: g.league, homeWon, adj,
    restDiff: hd - ad,
    form5: (lastN(hk, 5) ?? 0.5) - (lastN(ak, 5) ?? 0.5),
    form10: (lastN(hk, 10) ?? 0.5) - (lastN(ak, 10) ?? 0.5),
    season: (hs.w + hs.l >= 8 && as_.w + as_.l >= 8) ? rate(hs) - rate(as_) : 0,
    split: (hh.w + hh.l >= 5 && ar.w + ar.l >= 5) ? rate(hh) - rate(ar) : 0,
    homeStreak: streak(hk),
    awayStreak: streak(ak),
  });
  const exp = 1 / (1 + 10 ** (-(he + opt.home[g.league] - ae) / 400));
  const delta = opt.k[g.league] * ((homeWon ? 1 : 0) - exp);
  elo.set(hk, he + delta);
  elo.set(ak, ae - delta);
  const hw = rec(season, hk), aw = rec(season, ak);
  if (homeWon) { hw.w++; aw.l++; } else { hw.l++; aw.w++; }
  season.set(hk, hw); season.set(ak, aw);
  const hhs = rec(split, hk + "|H"), ars = rec(split, ak + "|R");
  if (homeWon) { hhs.w++; ars.l++; } else { hhs.l++; ars.w++; }
  split.set(hk + "|H", hhs); split.set(ak + "|R", ars);
  pushForm(hk, homeWon);
  pushForm(ak, !homeWon);
  last.set(hk, g.t);
  last.set(ak, g.t);
}

function acc(list, pick) {
  let h = 0;
  for (const r of list) if (pick(r) === r.homeWon) h++;
  return list.length ? h / list.length : 0;
}
const basePick = (r) => r.adj >= 0;
const val = rows.filter((r) => r.y >= 2016 && r.y < 2020);
const test = rows.filter((r) => r.y >= 2020);
const pct = (x) => Math.round(x * 1000) / 10;
console.log("base", pct(acc(rows, basePick)), "val", pct(acc(val, basePick)), "test", pct(acc(test, basePick)), "n", rows.length);

const misses = test.filter((r) => basePick(r) !== r.homeWon);
const hits = test.filter((r) => basePick(r) === r.homeWon);
function avg(list, fn) {
  let s = 0, n = 0;
  for (const r of list) { const v = fn(r); if (v != null) { s += v; n++; } }
  return n ? Math.round((s / n) * 1000) / 1000 : null;
}
console.log("test misses", misses.length, "of", test.length);
console.log("mean |edge| miss", avg(misses, (r) => Math.abs(r.adj)), "hit", avg(hits, (r) => Math.abs(r.adj)));
console.log("form5 agrees with pick miss", avg(misses, (r) => Math.sign(r.form5) === Math.sign(r.adj) || r.form5 === 0 ? 1 : 0), "hit", avg(hits, (r) => Math.sign(r.form5) === Math.sign(r.adj) || r.form5 === 0 ? 1 : 0));
console.log("season disagrees miss", avg(misses, (r) => r.season && Math.sign(r.season) !== Math.sign(r.adj) ? 1 : 0), "hit", avg(hits, (r) => r.season && Math.sign(r.season) !== Math.sign(r.adj) ? 1 : 0));
console.log("split disagrees miss", avg(misses, (r) => r.split && Math.sign(r.split) !== Math.sign(r.adj) ? 1 : 0), "hit", avg(hits, (r) => r.split && Math.sign(r.split) !== Math.sign(r.adj) ? 1 : 0));

function tryFlip(name, shouldFlip) {
  const pick = (r) => shouldFlip(r) ? !basePick(r) : basePick(r);
  const v = acc(val, pick), t = acc(test, pick), a = acc(rows, pick);
  const flips = test.filter(shouldFlip);
  let fixed = 0, broken = 0;
  for (const r of flips) {
    if (basePick(r) !== r.homeWon) fixed++;
    else broken++;
  }
  console.log(name, "all", pct(a), "val", pct(v), "test", pct(t), "test flips", flips.length, "fixed", fixed, "broken", broken);
  return { name, all: a, val: v, test: t, fixed, broken };
}

let best = null;
for (const edge of [20, 40, 60, 80, 120]) {
  for (const form of [0.2, 0.4, 0.6]) {
    const r = tryFlip(`edge<${edge} form5>=${form}`, (g) => Math.abs(g.adj) < edge && Math.abs(g.form5) >= form && Math.sign(g.form5) !== Math.sign(g.adj));
    if (r.val > acc(val, basePick) + 0.0005 && (!best || r.val > best.val)) best = r;
  }
  for (const gap of [0.08, 0.15, 0.25]) {
    const r = tryFlip(`edge<${edge} season>=${gap}`, (g) => Math.abs(g.adj) < edge && Math.abs(g.season) >= gap && Math.sign(g.season) !== Math.sign(g.adj));
    if (r.val > acc(val, basePick) + 0.0005 && (!best || r.val > best.val)) best = r;
    const s = tryFlip(`edge<${edge} split>=${gap}`, (g) => Math.abs(g.adj) < edge && Math.abs(g.split) >= gap && Math.sign(g.split) !== Math.sign(g.adj));
    if (s.val > acc(val, basePick) + 0.0005 && (!best || s.val > best.val)) best = s;
  }
}
for (const rest of [2, 3, 4]) {
  for (const edge of [40, 80, 150]) {
    const r = tryFlip(`edge<${edge} rest>${rest}`, (g) => Math.abs(g.adj) < edge && Math.abs(g.restDiff) >= rest && Math.sign(g.restDiff) !== Math.sign(g.adj));
    if (r.val > acc(val, basePick) + 0.0005 && (!best || r.val > best.val)) best = r;
  }
}
for (const n of [3, 4, 5]) {
  for (const edge of [40, 80, 150]) {
    const r = tryFlip(`edge<${edge} cold ${n}`, (g) => {
      if (Math.abs(g.adj) >= edge) return false;
      const favCold = g.adj >= 0 ? g.homeStreak <= -n : g.awayStreak <= -n;
      return favCold;
    });
    if (r.val > acc(val, basePick) + 0.0005 && (!best || r.val > best.val)) best = r;
  }
}
console.log("BEST", best);

const ands = [
  ["form+season", (g) => Math.abs(g.adj) < 40 && Math.abs(g.form5) >= 0.4 && Math.abs(g.season) >= 0.1 && Math.sign(g.form5) !== Math.sign(g.adj) && Math.sign(g.season) !== Math.sign(g.adj)],
  ["form+split", (g) => Math.abs(g.adj) < 40 && Math.abs(g.form5) >= 0.4 && Math.abs(g.split) >= 0.1 && Math.sign(g.form5) !== Math.sign(g.adj) && Math.sign(g.split) !== Math.sign(g.adj)],
  ["all three", (g) => Math.abs(g.adj) < 60 && Math.abs(g.form5) >= 0.2 && Math.abs(g.season) >= 0.08 && Math.abs(g.split) >= 0.08 && Math.sign(g.form5) !== Math.sign(g.adj) && Math.sign(g.season) !== Math.sign(g.adj) && Math.sign(g.split) !== Math.sign(g.adj)],
  ["season+split small", (g) => Math.abs(g.adj) < 30 && Math.abs(g.season) >= 0.12 && Math.abs(g.split) >= 0.12 && Math.sign(g.season) !== Math.sign(g.adj) && Math.sign(g.split) !== Math.sign(g.adj)],
];
for (const [name, fn] of ands) tryFlip(name, fn);

for (const league of ["NBA", "NFL", "NHL", "MLB"]) {
  const r = tryFlip(league + " season edge<30", (g) => g.league === league && Math.abs(g.adj) < 30 && Math.abs(g.season) >= 0.12 && Math.sign(g.season) !== Math.sign(g.adj));
  void r;
}
