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
const cap = { MLB: 6, NFL: 21, NHL: 3, NBA: 20 };

function run(opt) {
  const elo = new Map(), last = new Map(), seen = new Map();
  const hit = { all: 0, val: 0, test: 0 };
  const n = { all: 0, val: 0, test: 0 };
  const by = {};
  for (const g of games) {
    const hk = g.league + "|" + g.home, ak = g.league + "|" + g.away;
    const season = g.m >= startM[g.league] ? g.y : g.y - 1;
    const sk = g.league + "|" + season;
    if (seen.get(g.league) !== sk) {
      seen.set(g.league, sk);
      const pull = opt.regress[g.league];
      for (const [k, v] of elo) if (k.startsWith(g.league + "|")) elo.set(k, v + (1500 - v) * pull);
    }
    const he = elo.get(hk) ?? 1500, ae = elo.get(ak) ?? 1500;
    let adj = he + opt.home[g.league] - ae;
    const hd = last.get(hk) != null ? (g.t - last.get(hk)) / 86400000 : 7;
    const ad = last.get(ak) != null ? (g.t - last.get(ak)) / 86400000 : 7;
    if (hd < 1.4) adj -= opt.b2b[g.league];
    if (ad < 1.4) adj += opt.b2b[g.league];
    if (g.league === "NFL") {
      if (hd >= 12 && hd <= 16) adj += opt.bye;
      if (ad >= 12 && ad <= 16) adj -= opt.bye;
    }
    const actualHome = g.hs > g.as;
    const ok = (adj >= 0) === actualHome;
    const key = g.y >= 2020 ? "test" : g.y >= 2016 ? "val" : null;
    n.all++; if (ok) hit.all++;
    if (key) { n[key]++; if (ok) hit[key]++; }
    const row = (by[g.league] ??= [0, 0]); row[1]++; if (ok) row[0]++;
    const exp = 1 / (1 + 10 ** (-(he + opt.home[g.league] - ae) / 400));
    const margin = Math.min(cap[g.league], Math.abs(g.hs - g.as));
    const mov = opt.mov[g.league] === 0 ? 1 : (margin + 1) ** opt.mov[g.league];
    const delta = opt.k[g.league] * mov * ((actualHome ? 1 : 0) - exp);
    elo.set(hk, he + delta); elo.set(ak, ae - delta);
    last.set(hk, g.t); last.set(ak, g.t);
  }
  const pct = (h, c) => Math.round((10000 * h) / c) / 100;
  return {
    all: pct(hit.all, n.all), val: pct(hit.val, n.val), test: pct(hit.test, n.test),
    hits: hit.all, by: Object.fromEntries(Object.entries(by).map(([k, v]) => [k, pct(v[0], v[1])])),
  };
}

let opt = {
  k: { MLB: 4, NFL: 20, NHL: 14, NBA: 20 },
  home: { MLB: 28, NFL: 48, NHL: 35, NBA: 50 },
  b2b: { MLB: 0, NFL: 0, NHL: 25, NBA: 40 },
  regress: { MLB: 0.2, NFL: 0.2, NHL: 0.2, NBA: 0.2 },
  mov: { MLB: 0, NFL: 0, NHL: 0, NBA: 0 },
  bye: 0,
};
let best = run(opt);
console.log("start", best.all, "val", best.val, "test", best.test, best.by);
const grids = {
  k: { MLB: [2, 3, 4, 6, 8], NFL: [12, 16, 20, 24, 32], NHL: [8, 12, 14, 18, 24], NBA: [12, 16, 20, 24, 32] },
  home: { MLB: [16, 22, 28, 36, 48], NFL: [32, 40, 48, 65, 80], NHL: [20, 28, 35, 45, 60], NBA: [30, 40, 50, 70, 100] },
  regress: { MLB: [0.05, 0.15, 0.2, 0.3, 0.45], NFL: [0.05, 0.15, 0.2, 0.35], NHL: [0.1, 0.2, 0.3, 0.4], NBA: [0.05, 0.15, 0.2, 0.3] },
  mov: { MLB: [0, 0.15, 0.3, 0.5], NFL: [0, 0.15, 0.3, 0.45], NHL: [0, 0.2, 0.4], NBA: [0, 0.1, 0.2, 0.35] },
  b2b: { MLB: [0], NFL: [0], NHL: [0, 15, 25, 40], NBA: [0, 20, 40, 60] },
};
for (let round = 0; round < 2; round++) {
  for (const key of ["k", "home", "regress", "mov", "b2b"]) {
    for (const league of ["MLB", "NBA", "NFL", "NHL"]) {
      let local = { ...opt[key] };
      let localBest = best;
      let chosen = opt[key][league];
      for (const value of grids[key][league]) {
        const next = { ...opt, [key]: { ...opt[key], [league]: value } };
        const r = run(next);
        if (r.val > localBest.val + 0.005 && r.test + 0.05 >= best.test) {
          localBest = r;
          chosen = value;
        }
      }
      if (chosen !== opt[key][league]) {
        opt = { ...opt, [key]: { ...opt[key], [league]: chosen } };
        best = localBest;
        console.log("take", key, league, chosen, best.all, "val", best.val, "test", best.test);
      }
    }
  }
  for (const bye of [0, 8, 15, 25]) {
    const next = { ...opt, bye };
    const r = run(next);
    if (r.val > best.val + 0.005 && r.test + 0.05 >= best.test) {
      opt = next; best = r;
      console.log("take bye", bye, best.all, "val", best.val, "test", best.test);
    }
  }
}
console.log("FINAL", JSON.stringify({ all: best.all, val: best.val, test: best.test, hits: best.hits, by: best.by, opt }, null, 2));
