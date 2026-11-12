import { createServer } from "vite";
import fs from "node:fs";

const server = await createServer({ server: { middlewareMode: true }, appType: "custom", logLevel: "error" });
const voteMod = await server.ssrLoadModule("/src/lib/vote-decode.ts");
const dataMod = await server.ssrLoadModule("/src/lib/sports-data.ts");
const learnMod = await server.ssrLoadModule("/src/lib/sports-learning.ts");
const ruleMod = await server.ssrLoadModule("/src/lib/sports-rules.ts");
const { runVotes, TEAM_COLORS } = voteMod;
const { getTeamMeta } = dataMod;
const { runOriginal } = learnMod;
const { ruleId } = ruleMod;
const table = JSON.parse(fs.readFileSync("src/lib/sports-rules.json", "utf8"));
const BAND = { 15: 2.31, 30: 4.04, 40: 4.72, 50: 5.9 };

const games = [];
const raw = fs.readFileSync("/tmp/elo-games.jsonl", "utf8").replace(/\r?\n (?=\S)/g, " ").split("\n");
for (const line of raw) {
  if (!line) continue;
  const [date, league, home, away, hs, as] = line.split("\t");
  const t = Date.parse(date);
  if (!Number.isFinite(t) || !home || !away) continue;
  const dt = new Date(t);
  games.push({ t, y: dt.getUTCFullYear(), m: dt.getUTCMonth() + 1, d: dt.getUTCDate(), h: dt.getUTCHours(), league, home, away, hs: +hs, as: +as });
}
games.sort((a, b) => a.t - b.t || a.home.localeCompare(b.home));

const opt = { k: { MLB: 4, NFL: 20, NHL: 14, NBA: 20 }, home: { MLB: 28, NFL: 48, NHL: 35, NBA: 50 }, b2b: { MLB: 0, NFL: 0, NHL: 25, NBA: 40 }, regress: 0.2 };
const startM = { MLB: 3, NFL: 8, NHL: 9, NBA: 9 };
const elo = new Map(), last = new Map(), seen = new Map(), season = new Map();
const rows = [];
let n = 0;
for (const g of games) {
  const hk = g.league + "|" + g.home, ak = g.league + "|" + g.away;
  const seasonId = g.m >= startM[g.league] ? g.y : g.y - 1;
  const sk = g.league + "|" + seasonId;
  if (seen.get(g.league) !== sk) {
    seen.set(g.league, sk);
    for (const [k, v] of elo) if (k.startsWith(g.league + "|")) elo.set(k, v + (1500 - v) * opt.regress);
    for (const k of [...season.keys()]) if (k.startsWith(g.league + "|")) season.delete(k);
  }
  const he = elo.get(hk) ?? 1500, ae = elo.get(ak) ?? 1500;
  let adj = he + opt.home[g.league] - ae;
  const hd = last.get(hk) != null ? (g.t - last.get(hk)) / 86400000 : 7;
  const ad = last.get(ak) != null ? (g.t - last.get(ak)) / 86400000 : 7;
  if (hd < 1.4) adj -= opt.b2b[g.league];
  if (ad < 1.4) adj += opt.b2b[g.league];
  const rec = (k) => season.get(k) ?? { w: 0, l: 0 };
  const hr = rec(hk), ar = rec(ak);
  const side = (name, r) => {
    const meta = getTeamMeta(name);
    return { name, founded: meta?.founded ? [meta.founded[0], meta.founded[1], meta.founded[2]] : undefined, colors: TEAM_COLORS[name], record: r.w + r.l ? `${r.w}-${r.l}` : undefined, people: [] };
  };
  const homeMeta = getTeamMeta(g.home);
  const vote = runOriginal(() => runVotes({
    year: g.y, month: g.m, day: g.d, hour: g.h, league: g.league,
    home: side(g.home, hr), away: side(g.away, ar),
    stadium: homeMeta?.stadium, city: homeMeta?.city,
    stadiumOpened: homeMeta?.stadiumOpened, cityFounded: homeMeta?.cityFounded,
  }));
  let numH = 0, numA = 0;
  for (const v of vote.votes) {
    const row = table[ruleId(v.reason)];
    let w = v.weight;
    if (row && (row.total ?? 0) >= 100) w = Math.round(w * (row.weight ?? 0) * 100) / 100;
    if (v.side === "home") numH += w; else numA += w;
  }
  let recH = 0, recA = 0;
  const playedH = hr.w + hr.l, playedA = ar.w + ar.l;
  if (playedH >= 8 && playedA >= 8 && playedH + playedA > 0) {
    const hp = hr.w / playedH, ap = ar.w / playedA;
    if (hp !== ap) {
      const gap = Math.abs(hp - ap);
      const band = gap >= 0.5 ? 50 : gap >= 0.4 ? 40 : gap >= 0.3 ? 30 : gap >= 0.15 ? 15 : 0;
      const w = (band ? BAND[band] : 0) + 4 * gap;
      if (hp > ap) recH += w; else recA += w;
    }
  }
  const seasonDiff = playedH >= 8 && playedA >= 8 ? hr.w / playedH - ar.w / playedA : 0;
  rows.push({ y: g.y, league: g.league, homeWon: g.hs > g.as ? 1 : 0, adj: Math.round(adj), num: Math.round((numH - numA) * 100) / 100, rec: Math.round((recH - recA) * 100) / 100, season: Math.round(seasonDiff * 1000) / 1000, rest: Math.round((hd - ad) * 10) / 10 });
  const exp = 1 / (1 + 10 ** (-(he + opt.home[g.league] - ae) / 400));
  const delta = opt.k[g.league] * ((g.hs > g.as ? 1 : 0) - exp);
  elo.set(hk, he + delta); elo.set(ak, ae - delta);
  if (g.hs > g.as) { hr.w++; ar.l++; } else { hr.l++; ar.w++; }
  season.set(hk, hr); season.set(ak, ar);
  last.set(hk, g.t); last.set(ak, g.t);
  n++;
  if (n % 20000 === 0) console.log("scored", n);
}
await server.close();
fs.writeFileSync("/tmp/stack-rows.json", JSON.stringify(rows));
console.log("rows", rows.length);

function judge(scaleNum, scaleRec, guard) {
  let hit = 0, eloHit = 0, fixed = 0, broken = 0;
  const by = {};
  for (const r of rows) {
    const eloHome = r.adj >= 0;
    const eloW = Math.round(Math.abs(r.adj) / 40 * 100) / 100;
    let home = scaleNum * Math.max(r.num, 0) + scaleRec * Math.max(r.rec, 0);
    let away = scaleNum * Math.max(-r.num, 0) + scaleRec * Math.max(-r.rec, 0);
    if (eloHome) home += eloW; else away += eloW;
    let pickHome = home >= away;
    if (guard && Math.abs(r.adj) >= guard) pickHome = eloHome;
    const ok = pickHome === !!r.homeWon;
    if (ok) hit++;
    if (eloHome === !!r.homeWon) eloHit++;
    if (pickHome !== eloHome) { if (ok) fixed++; else broken++; }
    const b = (by[r.y >= 2020 ? "test" : r.y >= 2016 ? "val" : "train"] ??= { h: 0, n: 0 });
    b.n++; if (ok) b.h++;
  }
  const pct = (h, c) => Math.round((1000 * h) / c) / 10;
  return { all: pct(hit, rows.length), elo: pct(eloHit, rows.length), net: fixed - broken, fixed, broken, test: pct(by.test.h, by.test.n), val: pct(by.val.h, by.val.n) };
}
console.log("elo only", judge(0, 0, 0));
console.log("full stack", judge(1, 1, 0));

const val = rows.filter((r) => r.y >= 2016 && r.y < 2020);
const test = rows.filter((r) => r.y >= 2020);
function net(list, allow) {
  let fixed = 0, broken = 0, n = 0;
  for (const r of list) {
    if (!allow(r)) continue;
    const eloHome = r.adj >= 0;
    const against = (r.num + r.rec) !== 0 && ((r.num + r.rec) > 0) !== eloHome;
    if (!against) continue;
    n++;
    const ok = ((r.num + r.rec) > 0) === !!r.homeWon;
    if (ok) fixed++; else broken++;
  }
  return { n, fixed, broken, net: fixed - broken };
}
let best = null;
for (const edge of [15, 25, 40, 60, 80, 120]) {
  for (const vote of [0.5, 1, 2, 4, 6]) {
    for (const which of ["both", "rec", "num", "sum"]) {
      const allow = (r) => {
        if (Math.abs(r.adj) >= edge) return false;
        const eloHome = r.adj >= 0;
        const recAgainst = r.rec !== 0 && (r.rec > 0) !== eloHome && Math.abs(r.rec) >= vote;
        const numAgainst = r.num !== 0 && (r.num > 0) !== eloHome && Math.abs(r.num) >= vote;
        if (which === "both") return recAgainst && numAgainst;
        if (which === "rec") return recAgainst;
        if (which === "num") return numAgainst;
        return Math.abs(r.num + r.rec) >= vote && ((r.num + r.rec) > 0) !== eloHome;
      };
      const v = net(val, allow);
      if (v.net > 30 && (!best || v.net > best.val)) best = { edge, vote, which, val: v.net, valN: v.n, test: net(test, allow), all: net(rows, allow) };
    }
  }
}
console.log("best situational", JSON.stringify(best));
