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
const elo = new Map(), last = new Map(), seen = new Map();
const rows = [];
for (const g of games) {
  const hk = g.league + "|" + g.home, ak = g.league + "|" + g.away;
  const season = g.m >= startM[g.league] ? g.y : g.y - 1;
  const sk = g.league + "|" + season;
  if (seen.get(g.league) !== sk) {
    seen.set(g.league, sk);
    for (const [k, v] of elo) if (k.startsWith(g.league + "|")) elo.set(k, v + (1500 - v) * 0.2);
  }
  const he = elo.get(hk) ?? 1500, ae = elo.get(ak) ?? 1500;
  const homeAdv = g.league === "NFL" ? 48 : 35;
  const b2b = g.league === "NHL" ? 25 : 0;
  const hd = last.get(hk) != null ? (g.t - last.get(hk)) / 86400000 : 10;
  const ad = last.get(ak) != null ? (g.t - last.get(ak)) / 86400000 : 10;
  let adj = he + homeAdv - ae;
  if (hd < 1.4) adj -= b2b;
  if (ad < 1.4) adj += b2b;
  rows.push({ y: g.y, league: g.league, adj, hd, ad, margin: g.hs - g.as, homeWon: g.hs > g.as ? 1 : 0, he, ae });
  const exp = 1 / (1 + 10 ** (-(he + homeAdv - ae) / 400));
  const k = g.league === "NFL" ? 20 : 14;
  const delta = k * ((g.hs > g.as ? 1 : 0) - exp);
  elo.set(hk, he + delta); elo.set(ak, ae - delta);
  last.set(hk, g.t); last.set(ak, g.t);
}

function evalRows(list, tweak) {
  let hit = 0, base = 0;
  for (const r of list) {
    const adj = r.adj + tweak(r);
    if ((adj >= 0) === !!r.homeWon) hit++;
    if ((r.adj >= 0) === !!r.homeWon) base++;
  }
  return { n: list.length, hit, base, net: hit - base, pct: list.length ? Math.round(1000 * hit / list.length) / 10 : 0, basePct: list.length ? Math.round(1000 * base / list.length) / 10 : 0 };
}
function splits(league, tweak) {
  const all = rows.filter((r) => r.league === league);
  const val = all.filter((r) => r.y >= 2016 && r.y < 2020);
  const test = all.filter((r) => r.y >= 2020);
  return { all: evalRows(all, tweak), val: evalRows(val, tweak), test: evalRows(test, tweak) };
}
function show(name, league, tweak) {
  const s = splits(league, tweak);
  console.log(name, "all", s.all.pct, "net", s.all.net, "val", s.val.pct, "valNet", s.val.net, "test", s.test.pct, "testNet", s.test.net, "baseTest", s.test.basePct);
}

show("NHL base", "NHL", () => 0);
for (const road of [10, 20, 35, 50]) {
  show("NHL extra road b2b " + road, "NHL", (r) => (r.ad < 1.4 && r.hd >= 1.4 ? road : 0) - (r.hd < 1.4 && r.ad >= 1.4 ? road : 0));
}
for (const pen of [15, 30, 45]) {
  show("NHL tired 3 days " + pen, "NHL", (r) => (r.ad < 2.4 && r.hd >= 2.4 ? pen : 0) - (r.hd < 2.4 && r.ad >= 2.4 ? pen : 0));
}
show("NFL base", "NFL", () => 0);
for (const bye of [10, 20, 35]) {
  show("NFL bye " + bye, "NFL", (r) => (r.hd >= 12 && r.hd <= 16 ? bye : 0) - (r.ad >= 12 && r.ad <= 16 ? bye : 0));
}
for (const short of [10, 20, 35]) {
  show("NFL short " + short, "NFL", (r) => (r.hd >= 5 && r.hd < 7 ? -short : 0) + (r.ad >= 5 && r.ad < 7 ? short : 0));
}

const nhl = rows.filter((r) => r.league === "NHL" && r.y >= 2020);
let homeB2b = 0, homeB2bN = 0, roadB2b = 0, roadB2bN = 0;
for (const r of nhl) {
  if (r.hd < 1.4 && r.ad >= 1.4) { homeB2bN++; homeB2b += r.homeWon; }
  if (r.ad < 1.4 && r.hd >= 1.4) { roadB2bN++; roadB2b += r.homeWon; }
}
console.log("NHL test home win when home b2b", Math.round(1000 * homeB2b / homeB2bN) / 10, "n", homeB2bN);
console.log("NHL test home win when road b2b", Math.round(1000 * roadB2b / roadB2bN) / 10, "n", roadB2bN);
