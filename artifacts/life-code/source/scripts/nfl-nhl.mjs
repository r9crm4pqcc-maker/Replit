import fs from "node:fs";

const raw = [];
for (const line of fs.readFileSync("/tmp/elo-games.jsonl", "utf8").replace(/\r?\n (?=\S)/g, " ").split("\n")) {
  if (!line) continue;
  const [date, league, home, away, hs, as] = line.split("\t");
  const t = Date.parse(date);
  if (!Number.isFinite(t) || !home || !away) continue;
  const dt = new Date(t);
  raw.push({ t, y: dt.getUTCFullYear(), m: dt.getUTCMonth() + 1, league, home: home.replace(/\s+/g, " ").trim(), away: away.replace(/\s+/g, " ").trim(), hs: +hs, as: +as });
}
raw.sort((a, b) => a.t - b.t || a.home.localeCompare(b.home));

const NFL = {
  "Boston Redskins": "Washington Commanders", "Washington Redskins": "Washington Commanders",
  "Boston Patriots": "New England Patriots",
  "Cleveland Rams": "Los Angeles Rams", "St. Louis Rams": "Los Angeles Rams",
  "Chicago Cardinals": "Arizona Cardinals", "St. Louis Cardinals": "Arizona Cardinals", "Phoenix Cardinals": "Arizona Cardinals",
  "Dallas Texans": "Kansas City Chiefs",
  "Houston Oilers": "Tennessee Titans", "Tennessee Oilers": "Tennessee Titans",
  "Oakland Raiders": "Las Vegas Raiders", "Los Angeles Raiders": "Las Vegas Raiders",
  "San Diego Chargers": "Los Angeles Chargers",
  "Baltimore Colts": "Indianapolis Colts",
};
const NHL_STATIC = {
  "Anaheim Mighty Ducks": "Anaheim Ducks",
  "Hartford Whalers": "Carolina Hurricanes",
  "Quebec Nordiques": "Colorado Avalanche",
  "Phoenix Coyotes": "Utah Mammoth", "Arizona Coyotes": "Utah Mammoth", "Utah Hockey Club": "Utah Mammoth",
  "Atlanta Thrashers": "Winnipeg Jets",
};
const JUNK = /all[- ]?star|team |conf |conference|^afc$|^nfc$|^atlantic$|^central$|^metro$|^pacific$|phantoms|mannheim|belfast|dinamo|zug|frolunda|liberec|slovan|hamburg|ilves|jokerit|malmo|magnitogorsk|bern|petersburg|^canada$|^finland$|^sweden$|^usa$/i;
function canon(league, name, year) {
  const n = name.replace(/\s+/g, " ").trim();
  if (JUNK.test(n)) return null;
  if (league === "NFL") return NFL[n] ?? n;
  if (league === "NHL") {
    if (n === "Winnipeg Jets" && year < 2011) return "Utah Mammoth";
    return NHL_STATIC[n] ?? n;
  }
  return n;
}

const startM = { MLB: 3, NFL: 8, NHL: 9, NBA: 9 };
function replay(useCanon) {
  const games = raw.map((g) => {
    const home = useCanon ? canon(g.league, g.home, g.y) : g.home;
    const away = useCanon ? canon(g.league, g.away, g.y) : g.away;
    return home && away ? { ...g, home, away } : null;
  }).filter(Boolean);
  const elo = new Map(), last = new Map(), recent = new Map(), seen = new Map();
  const base = { k: { MLB: 4, NFL: 20, NHL: 14, NBA: 20 }, home: { MLB: 28, NFL: 48, NHL: 35, NBA: 50 }, b2b: { MLB: 0, NFL: 0, NHL: 25, NBA: 40 } };
  const stat = {};
  const bump = (key, y, ok) => {
    const row = (stat[key] ??= { all: [0, 0], val: [0, 0], test: [0, 0] });
    row.all[1]++; if (ok) row.all[0]++;
    const b = y >= 2020 ? "test" : y >= 2016 ? "val" : null;
    if (b) { row[b][1]++; if (ok) row[b][0]++; }
  };
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
    const ok = (adj >= 0) === (g.hs > g.as);
    bump(g.league, g.y, ok);
    bump("ALL", g.y, ok);
    if ((g.league === "NHL" || g.league === "NFL") && (hd < 1.4 || ad < 1.4)) bump(g.league + "-b2b", g.y, ok);
    const exp = 1 / (1 + 10 ** (-(he + base.home[g.league] - ae) / 400));
    const delta = base.k[g.league] * ((g.hs > g.as ? 1 : 0) - exp);
    elo.set(hk, he + delta); elo.set(ak, ae - delta);
    last.set(hk, g.t); last.set(ak, g.t);
    recent.set(hk, g.t); recent.set(ak, g.t);
  }
  const pct = (p) => p[1] ? Math.round((1000 * p[0]) / p[1]) / 10 + " n=" + p[1] : "-";
  for (const k of ["NFL", "NHL", "NFL-b2b", "NHL-b2b", "ALL"]) {
    const s = stat[k];
    if (s) console.log(useCanon ? "canon" : "raw", k, "all", pct(s.all), "val", pct(s.val), "test", pct(s.test));
  }
}
replay(false);
replay(true);
