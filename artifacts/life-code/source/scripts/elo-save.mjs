import fs from "node:fs";

const games = [];
for (const line of fs.readFileSync("/tmp/elo-games.jsonl", "utf8").split("\n")) {
  if (!line) continue;
  const [date, league, home, away, hs, as] = line.split("\t");
  const t = Date.parse(date);
  if (!Number.isFinite(t)) continue;
  games.push({ t, date: date.slice(0, 10), y: new Date(t).getUTCFullYear(), m: new Date(t).getUTCMonth() + 1, league, home, away, hs: +hs, as: +as });
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
let hit = 0;
for (const g of games) {
  const hk = g.league + "|" + g.home, ak = g.league + "|" + g.away;
  const season = g.m >= startM[g.league] ? g.y : g.y - 1;
  const sk = g.league + "|" + season;
  if (seen.get(g.league) !== sk) {
    seen.set(g.league, sk);
    for (const [k, v] of elo) if (k.startsWith(g.league + "|")) elo.set(k, v + (1500 - v) * opt.regress);
  }
  const he = elo.get(hk) ?? 1500, ae = elo.get(ak) ?? 1500;
  let adj = he + opt.home[g.league] - ae;
  const hd = last.get(hk) != null ? (g.t - last.get(hk)) / 86400000 : 7;
  const ad = last.get(ak) != null ? (g.t - last.get(ak)) / 86400000 : 7;
  if (hd < 1.4) adj -= opt.b2b[g.league];
  if (ad < 1.4) adj += opt.b2b[g.league];
  if ((adj >= 0) === (g.hs > g.as)) hit++;
  const exp = 1 / (1 + 10 ** (-(he + opt.home[g.league] - ae) / 400));
  const k = opt.k[g.league];
  const delta = k * ((g.hs > g.as ? 1 : 0) - exp);
  elo.set(hk, he + delta);
  elo.set(ak, ae - delta);
  last.set(hk, g.t);
  last.set(ak, g.t);
}
const ratings = {};
for (const [k, v] of elo) {
  const cut = k.indexOf("|");
  const league = k.slice(0, cut);
  const name = k.slice(cut + 1);
  (ratings[league] ??= {})[name] = { elo: Math.round(v), last: new Date(last.get(k)).toISOString().slice(0, 10) };
}
fs.writeFileSync("src/lib/team-ratings.json", JSON.stringify(ratings));
console.log("saved", Object.values(ratings).reduce((n, t) => n + Object.keys(t).length, 0), "hit", Math.round(1000 * hit / games.length) / 10);
