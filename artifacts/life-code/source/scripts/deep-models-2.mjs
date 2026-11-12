import fs from "node:fs";

const games = [];
for (const line of fs.readFileSync("/tmp/elo-games.jsonl", "utf8").replace(/\r?\n (?=\S)/g, " ").split("\n")) {
  if (!line) continue;
  const [date, league, home, away, hs, as] = line.split("\t");
  const t = Date.parse(date);
  if (!Number.isFinite(t) || !home || !away) continue;
  const dt = new Date(t);
  games.push({ t, y: dt.getUTCFullYear(), m: dt.getUTCMonth() + 1, league, home, away, hs: +hs, as: +as });
}
games.sort((a, b) => a.t - b.t || a.home.localeCompare(b.home));
const startM = { MLB: 3, NFL: 8, NHL: 9, NBA: 9 };
const base = { k: { MLB: 4, NFL: 20, NHL: 14, NBA: 20 }, home: { MLB: 28, NFL: 48, NHL: 35, NBA: 50 }, b2b: { MLB: 0, NFL: 0, NHL: 25, NBA: 40 } };

function run(mode) {
  const elo = new Map(), homeE = new Map(), roadE = new Map(), last = new Map(), seen = new Map(), margin = new Map(), lastMov = new Map();
  const hits = { all: [0, 0], test: [0, 0], val: [0, 0] };
  const by = {};
  const id = (g, n) => g.league + "|" + n;
  for (const g of games) {
    const hk = id(g, g.home), ak = id(g, g.away);
    const season = g.m >= startM[g.league] ? g.y : g.y - 1;
    const sk = g.league + "|" + season;
    if (seen.get(g.league) !== sk) {
      seen.set(g.league, sk);
      for (const map of [elo, homeE, roadE, margin]) {
        for (const [k, v] of map) if (k.startsWith(g.league + "|")) map.set(k, k.startsWith(g.league) && map !== margin ? v + (1500 - v) * 0.2 : v * 0.5);
      }
    }
    const he = elo.get(hk) ?? 1500, ae = elo.get(ak) ?? 1500;
    let adj = he + base.home[g.league] - ae;
    const hd = last.get(hk) != null ? (g.t - last.get(hk)) / 86400000 : 7;
    const ad = last.get(ak) != null ? (g.t - last.get(ak)) / 86400000 : 7;
    if (hd < 1.4) adj -= base.b2b[g.league];
    if (ad < 1.4) adj += base.b2b[g.league];
    const split = (homeE.get(hk) ?? 1500) - (roadE.get(ak) ?? 1500);
    const mp = (margin.get(hk) ?? 0) - (margin.get(ak) ?? 0);
    let score = adj;
    if (mode === "split") score = split;
    if (mode === "blend") score = adj * 0.7 + (split - 1500) * 0.15;
    if (mode === "nfl-margin" && g.league === "NFL") score = adj + 4 * mp;
    if (mode === "bounce") {
      const hB = lastMov.get(hk) ?? 0, aB = lastMov.get(ak) ?? 0;
      if (hB < -14 && g.league !== "MLB") score += 8;
      if (aB < -14 && g.league !== "MLB") score -= 8;
    }
    const pickHome = score >= 0;
    const actual = g.hs > g.as;
    const ok = pickHome === actual;
    hits.all[1]++; if (ok) hits.all[0]++;
    const key = g.y >= 2020 ? "test" : g.y >= 2016 ? "val" : null;
    if (key) { hits[key][1]++; if (ok) hits[key][0]++; }
    const row = (by[g.league + (key === "test" ? "-test" : "")] ??= [0, 0]);
    row[1]++; if (ok) row[0]++;
    const exp = 1 / (1 + 10 ** (-(he + base.home[g.league] - ae) / 400));
    const delta = base.k[g.league] * ((actual ? 1 : 0) - exp);
    elo.set(hk, he + delta); elo.set(ak, ae - delta);
    const hdlt = delta * (mode === "split" ? 1 : 0.5);
    homeE.set(hk, (homeE.get(hk) ?? 1500) + (hdlt || delta));
    roadE.set(ak, (roadE.get(ak) ?? 1500) - (hdlt || delta));
    const err = (g.hs - g.as) - mp;
    margin.set(hk, (margin.get(hk) ?? 0) + 0.06 * err);
    margin.set(ak, (margin.get(ak) ?? 0) - 0.06 * err);
    lastMov.set(hk, g.hs - g.as); lastMov.set(ak, g.as - g.hs);
    last.set(hk, g.t); last.set(ak, g.t);
  }
  const pct = (p) => Math.round((1000 * p[0]) / p[1]) / 10;
  const show = {};
  for (const [k, v] of Object.entries(by)) if (k.endsWith("-test") || true) show[k] = pct(v);
  return { all: pct(hits.all), val: pct(hits.val), test: pct(hits.test), show };
}
for (const mode of ["elo", "split", "blend", "nfl-margin", "bounce"]) {
  const r = run(mode);
  console.log(mode, "all", r.all, "val", r.val, "test", r.test, "NFL", r.show.NFL, "NFLtest", r.show["NFL-test"], "NBA", r.show.NBA, "NBAtest", r.show["NBA-test"]);
}
