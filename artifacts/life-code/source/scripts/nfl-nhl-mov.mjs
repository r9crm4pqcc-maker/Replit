import fs from "node:fs";

const games = [];
for (const line of fs.readFileSync("/tmp/elo-games.jsonl", "utf8").replace(/\r?\n (?=\S)/g, " ").split("\n")) {
  if (!line) continue;
  const [date, league, home, away, hs, as] = line.split("\t");
  if (league !== "NFL" && league !== "NHL") continue;
  const t = Date.parse(date);
  if (!Number.isFinite(t) || !home || !away) continue;
  const dt = new Date(t);
  games.push({ t, y: dt.getUTCFullYear(), m: dt.getUTCMonth() + 1, league, home: home.replace(/\s+/g, " ").trim(), away: away.replace(/\s+/g, " ").trim(), hs: +hs, as: +as });
}
games.sort((a, b) => a.t - b.t);
const startM = { NFL: 8, NHL: 9 };

function replay(opt) {
  const elo = new Map(), last = new Map(), seen = new Map();
  const box = { NFL: { all: [0, 0], val: [0, 0], test: [0, 0] }, NHL: { all: [0, 0], val: [0, 0], test: [0, 0] } };
  for (const g of games) {
    const hk = g.league + "|" + g.home, ak = g.league + "|" + g.away;
    const season = g.m >= startM[g.league] ? g.y : g.y - 1;
    const sk = g.league + "|" + season;
    if (seen.get(g.league) !== sk) {
      seen.set(g.league, sk);
      for (const [k, v] of elo) if (k.startsWith(g.league + "|")) elo.set(k, v + (1500 - v) * 0.2);
    }
    const he = elo.get(hk) ?? 1500, ae = elo.get(ak) ?? 1500;
    const hd = last.get(hk) != null ? (g.t - last.get(hk)) / 86400000 : 10;
    const ad = last.get(ak) != null ? (g.t - last.get(ak)) / 86400000 : 10;
    let adj = he + opt.home[g.league] - ae;
    const homeTired = hd < 1.4, awayTired = ad < 1.4;
    if (homeTired) adj -= opt.b2b[g.league] + (g.league === "NHL" ? opt.homeB2b : 0);
    if (awayTired) adj += opt.b2b[g.league] + (g.league === "NHL" ? opt.roadB2b : 0);
    const ok = (adj >= 0) === (g.hs > g.as);
    const slot = g.y >= 2020 ? "test" : g.y >= 2016 ? "val" : null;
    box[g.league].all[1]++; if (ok) box[g.league].all[0]++;
    if (slot) { box[g.league][slot][1]++; if (ok) box[g.league][slot][0]++; }
    const exp = 1 / (1 + 10 ** (-(he + opt.home[g.league] - ae) / 400));
    const pd = Math.abs(g.hs - g.as);
    let mov = 1;
    if (g.league === "NFL" && opt.nflMov) mov = Math.log(pd + 1) * opt.nflMov / (0.001 * Math.abs(he - ae) + opt.nflMov);
    if (g.league === "NHL" && opt.nhlMov) mov = 1 + Math.min(pd, 3) * opt.nhlMov;
    const delta = opt.k[g.league] * mov * ((g.hs > g.as ? 1 : 0) - exp);
    elo.set(hk, he + delta); elo.set(ak, ae - delta);
    last.set(hk, g.t); last.set(ak, g.t);
  }
  const pct = (p) => Math.round((1000 * p[0]) / p[1]) / 10;
  return {
    NFL: { all: pct(box.NFL.all), val: pct(box.NFL.val), test: pct(box.NFL.test), valNet: box.NFL.val[0], testN: box.NFL.test[1] },
    NHL: { all: pct(box.NHL.all), val: pct(box.NHL.val), test: pct(box.NHL.test) },
  };
}

const base = { k: { NFL: 20, NHL: 14 }, home: { NFL: 48, NHL: 35 }, b2b: { NFL: 0, NHL: 25 }, homeB2b: 0, roadB2b: 0, nflMov: 0, nhlMov: 0 };
console.log("base", JSON.stringify(replay(base)));
let best = null;
for (const nflMov of [0, 1.6, 2.2, 3]) for (const k of [16, 20, 28]) for (const home of [40, 48, 60]) {
  const r = replay({ ...base, nflMov, k: { ...base.k, NFL: k }, home: { ...base.home, NFL: home } });
  if (!best || r.NFL.val > best.r.NFL.val) best = { nflMov, k, home, r };
}
console.log("best NFL by val", JSON.stringify(best));
let bestH = null;
for (const homeB2b of [0, 15, 30, 45]) for (const roadB2b of [0, 10, 20]) for (const nhlMov of [0, 0.08, 0.15]) for (const k of [12, 14, 18]) {
  const r = replay({ ...base, homeB2b, roadB2b, nhlMov, k: { ...base.k, NHL: k } });
  if (!bestH || r.NHL.val > bestH.r.NHL.val) bestH = { homeB2b, roadB2b, nhlMov, k, r };
}
console.log("best NHL by val", JSON.stringify(bestH));
