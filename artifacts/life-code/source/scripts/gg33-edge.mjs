import { createServer } from "vite";
import fs from "node:fs";

const server = await createServer({ server: { middlewareMode: true }, appType: "custom", logLevel: "error" });
const dataMod = await server.ssrLoadModule("/src/lib/sports-data.ts");
const numMod = await server.ssrLoadModule("/src/lib/numerology.ts");
const { getTeamMeta } = dataMod;
const { reduce, calcPersonalDay, digitSum } = numMod;
await server.close();

const games = [];
for (const line of fs.readFileSync("/tmp/elo-games.jsonl", "utf8").replace(/\r?\n (?=\S)/g, " ").split("\n")) {
  if (!line) continue;
  const [date, league, home, away, hs, as] = line.split("\t");
  const t = Date.parse(date);
  if (!Number.isFinite(t) || !home || !away) continue;
  const dt = new Date(t);
  games.push({ t, y: dt.getUTCFullYear(), m: dt.getUTCMonth() + 1, d: dt.getUTCDate(), league, home, away, hs: +hs, as: +as });
}
games.sort((a, b) => a.t - b.t || a.home.localeCompare(b.home));

const base = { k: { MLB: 4, NFL: 20, NHL: 14, NBA: 20 }, home: { MLB: 28, NFL: 48, NHL: 35, NBA: 50 }, b2b: { MLB: 0, NFL: 0, NHL: 25, NBA: 40 } };
const startM = { MLB: 3, NFL: 8, NHL: 9, NBA: 9 };
const elo = new Map(), last = new Map(), seen = new Map();
const cache = new Map();
function meta(name) {
  if (cache.has(name)) return cache.get(name);
  const m = getTeamMeta(name);
  const founded = m?.founded;
  const year = founded?.[0];
  const imprint = year ? reduce([...String(year)].reduce((a, d) => a + +d, 0)) : null;
  const lp = founded ? reduce([...`${founded[0]}${String(founded[1]).padStart(2, "0")}${String(founded[2]).padStart(2, "0")}`].reduce((a, d) => a + +d, 0)) : null;
  const row = { founded, imprint, lp };
  cache.set(name, row);
  return row;
}
function ud(y, m, d) {
  const full = [...`${String(m).padStart(2, "0")}${String(d).padStart(2, "0")}${y}`].reduce((a, c) => a + +c, 0);
  return { full, energy: reduce(full) };
}
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
  let adj = he + base.home[g.league] - ae;
  const hd = last.get(hk) != null ? (g.t - last.get(hk)) / 86400000 : 7;
  const ad = last.get(ak) != null ? (g.t - last.get(ak)) / 86400000 : 7;
  if (hd < 1.4) adj -= base.b2b[g.league];
  if (ad < 1.4) adj += base.b2b[g.league];
  const day = ud(g.y, g.m, g.d);
  const H = meta(g.home), A = meta(g.away);
  const cheat = (info) => {
    if (!info.imprint || !info.founded) return false;
    return day.energy === info.imprint || day.full === info.founded[0] % 100;
  };
  const lpHit = (info) => info.lp != null && (info.lp === day.energy || info.lp === reduce(digitSum(g.m + g.d + digitSum(g.y))));
  const pdHit = (info) => {
    if (!info.founded) return false;
    const pd = calcPersonalDay(info.founded[1], info.founded[2], g.m, g.d, g.y);
    return pd.reduced === day.energy || pd.compound === day.full;
  };
  rows.push({
    y: g.y, league: g.league, homeWon: g.hs > g.as ? 1 : 0, eloHome: adj >= 0 ? 1 : 0,
    hCheat: cheat(H) ? 1 : 0, aCheat: cheat(A) ? 1 : 0,
    hLp: lpHit(H) ? 1 : 0, aLp: lpHit(A) ? 1 : 0,
    hPd: pdHit(H) ? 1 : 0, aPd: pdHit(A) ? 1 : 0,
  });
  const exp = 1 / (1 + 10 ** (-adj / 400));
  const delta = base.k[g.league] * ((g.hs > g.as ? 1 : 0) - exp);
  elo.set(hk, he + delta); elo.set(ak, ae - delta);
  last.set(hk, g.t); last.set(ak, g.t);
}

function report(name, flagH, flagA) {
  const splits = { all: [0, 0, 0], val: [0, 0, 0], test: [0, 0, 0] };
  let legs = 0, legHit = 0, eloOnLegs = 0;
  for (const r of rows) {
    const h = r[flagH], a = r[flagA];
    const bucket = r.y >= 2020 ? "test" : r.y >= 2016 ? "val" : null;
    if (h === a) continue;
    const pickHome = h ? 1 : 0;
    const ok = pickHome === r.homeWon;
    const eloOk = r.eloHome === r.homeWon;
    splits.all[2]++; if (ok) splits.all[0]++; if (eloOk) splits.all[1]++;
    if (bucket) { splits[bucket][2]++; if (ok) splits[bucket][0]++; if (eloOk) splits[bucket][1]++; }
    if (r.y >= 2020) { legs++; if (ok) legHit++; if (eloOk) eloOnLegs++; }
  }
  const pct = (h, n) => (n ? Math.round((1000 * h) / n) / 10 : 0);
  console.log(name, {
    n: splits.all[2],
    gg: pct(splits.all[0], splits.all[2]),
    eloSameGames: pct(splits.all[1], splits.all[2]),
    net: splits.all[0] - splits.all[1],
    valNet: splits.val[0] - splits.val[1],
    testN: splits.test[2],
    testGg: pct(splits.test[0], splits.test[2]),
    testElo: pct(splits.test[1], splits.test[2]),
    testNet: splits.test[0] - splits.test[1],
  });
}
report("cheat code, one side only", "hCheat", "aCheat");
report("life path equals the day, one side", "hLp", "aLp");
report("personal day equals the day, one side", "hPd", "aPd");
const eloHit = rows.filter((r) => r.eloHome === r.homeWon).length;
console.log("elo all", Math.round((1000 * eloHit) / rows.length) / 10, "n", rows.length);
