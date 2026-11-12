import fs from "node:fs";
import { createJiti } from "jiti";

const jiti = createJiti(import.meta.url, {
  alias: { "@": "/workspace/src" },
});
const { getTeamMeta } = jiti("../src/lib/sports-data.ts");
const { runVotes } = jiti("../src/lib/vote-decode.ts");

const CUT = Date.parse("2026-11-09T06:00:00Z");
const games = [];
for (const line of fs.readFileSync("/tmp/elo-games.jsonl", "utf8").replace(/\r?\n (?=\S)/g, " ").split("\n")) {
  if (!line.includes("\t")) continue;
  const [date, league, home, away, hs, as] = line.split("\t");
  const t = Date.parse(date);
  if (!Number.isFinite(t) || t >= CUT || !home || !away) continue;
  if (!["MLB", "NFL", "NHL", "NBA"].includes(league)) continue;
  const dt = new Date(t);
  games.push({
    t, y: dt.getUTCFullYear(), m: dt.getUTCMonth() + 1, d: dt.getUTCDate(),
    league, home: home.replace(/\s+/g, " ").trim(), away: away.replace(/\s+/g, " ").trim(),
    hs: +hs, as: +as,
  });
}
games.sort((a, b) => a.t - b.t || a.home.localeCompare(b.home));

const opt = {
  k: { MLB: 4, NFL: 20, NHL: 14, NBA: 20 },
  home: { MLB: 28, NFL: 48, NHL: 35, NBA: 50 },
  b2b: { MLB: 0, NFL: 0, NHL: 25, NBA: 40 },
  regress: 0.2,
  nflMov: 2.2,
};
const startM = { MLB: 3, NFL: 8, NHL: 9, NBA: 9 };
const elo = new Map(), last = new Map(), seen = new Map();
const box = {};
const cal = {};
const dated = { n: 0, lock: 0, open: 0, num: 0, flips: 0, flipHit: 0, matched: 0 };
const ensure = (lg) => (box[lg] ??= { n: 0, h: 0, y2024: [0, 0], y2025: [0, 0], y2026: [0, 0] });

const founded = (name) => {
  const meta = getTeamMeta(name);
  return meta?.founded ? [meta.founded[0], meta.founded[1], meta.founded[2]] : undefined;
};

let i = 0;
const t0 = Date.now();
for (const g of games) {
  const hk = g.league + "|" + g.home, ak = g.league + "|" + g.away;
  const season = g.m >= startM[g.league] ? g.y : g.y - 1;
  const sk = g.league + "|" + season;
  if (seen.get(g.league) !== sk) {
    seen.set(g.league, sk);
    for (const [k, v] of elo) if (k.startsWith(g.league + "|")) elo.set(k, v + (1500 - v) * opt.regress);
  }
  const he = elo.get(hk) ?? 1500, ae = elo.get(ak) ?? 1500;
  const hd = last.get(hk) != null ? (g.t - last.get(hk)) / 86400000 : 10;
  const ad = last.get(ak) != null ? (g.t - last.get(ak)) / 86400000 : 10;
  let adj = he + opt.home[g.league] - ae;
  if (hd < 1.4) adj -= opt.b2b[g.league];
  if (ad < 1.4) adj += opt.b2b[g.league];
  const actualHome = g.hs > g.as;
  const lockHome = adj >= 0;
  const row = ensure(g.league);
  row.n++; if (lockHome === actualHome) row.h++;
  const yr = g.y === 2024 ? "y2024" : g.y === 2025 ? "y2025" : g.y === 2026 ? "y2026" : null;
  if (yr) { row[yr][1]++; if (lockHome === actualHome) row[yr][0]++; }
  const p = 1 / (1 + 10 ** (-Math.abs(adj) / 400));
  const band = p >= 0.75 ? "75+" : p >= 0.65 ? "65-74" : p >= 0.55 ? "55-64" : "50-54";
  const c = (cal[band] ??= [0, 0]);
  c[1]++; if (lockHome === actualHome) c[0]++;

  const hf = founded(g.home), af = founded(g.away);
  if (hf && af) {
    dated.matched++;
    const v = runVotes({
      year: g.y, month: g.m, day: g.d, league: "REPLAY", hour: 19,
      home: { name: g.home, founded: hf, people: [] },
      away: { name: g.away, founded: af, people: [] },
    });
    const w = Math.round(Math.abs(adj) / 40 * 100) / 100;
    let h = v.home, a = v.away;
    if (lockHome) h += w; else a += w;
    const openHome = h >= a;
    const numHome = v.home >= v.away;
    if (lockHome === actualHome) dated.lock++;
    if (openHome === actualHome) dated.open++;
    if (numHome === actualHome) dated.num++;
    dated.n++;
    if (openHome !== lockHome) {
      dated.flips++;
      if (openHome === actualHome) dated.flipHit++;
    }
  }

  const exp = 1 / (1 + 10 ** (-(he + opt.home[g.league] - ae) / 400));
  const pd = Math.abs(g.hs - g.as);
  let mov = 1;
  if (g.league === "NFL") mov = Math.log(pd + 1) * opt.nflMov / (0.001 * Math.abs(he - ae) + opt.nflMov);
  const delta = opt.k[g.league] * mov * ((actualHome ? 1 : 0) - exp);
  elo.set(hk, he + delta); elo.set(ak, ae - delta);
  last.set(hk, g.t); last.set(ak, g.t);
  i++;
  if (i % 20000 === 0) console.error("progress", i, "sec", Math.round((Date.now() - t0) / 1000));
}

const pct = (h, n) => (n ? Math.round((1000 * h) / n) / 10 : 0);
const out = {
  through: "2026-11-08",
  games: games.length,
  seconds: Math.round((Date.now() - t0) / 1000),
  learned: {
    pct: pct(Object.values(box).reduce((s, r) => s + r.h, 0), games.length),
    by: Object.fromEntries(Object.entries(box).map(([k, r]) => [k, {
      n: r.n, pct: pct(r.h, r.n),
      y2024: pct(r.y2024[0], r.y2024[1]),
      y2025: pct(r.y2025[0], r.y2025[1]),
      y2026: pct(r.y2026[0], r.y2026[1]),
      n2026: r.y2026[1],
    }])),
    confidence: Object.fromEntries(Object.entries(cal).map(([k, v]) => [k, { n: v[1], hit: pct(v[0], v[1]) }])),
  },
  withDates: {
    matched: dated.matched,
    lockedHit: pct(dated.lock, dated.n),
    datesAllowedToFlip: pct(dated.open, dated.n),
    datesOnly: pct(dated.num, dated.n),
    flips: dated.flips,
    flipsThatWereRight: dated.flipHit,
  },
};
fs.writeFileSync("/tmp/date-rerun.json", JSON.stringify(out, null, 2));
console.log(JSON.stringify(out, null, 2));
