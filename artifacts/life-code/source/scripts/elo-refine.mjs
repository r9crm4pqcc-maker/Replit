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
const startM = { MLB: 3, NFL: 8, NHL: 9, NBA: 9 };
const pyExp = { MLB: 1.83, NFL: 2.37, NHL: 2.05, NBA: 13.91 };

function run(opt) {
  const elo = new Map();
  const last = new Map();
  const seen = new Map();
  const off = new Map();
  const def = new Map();
  const gp = new Map();
  let hit = 0;
  const by = {};
  for (const g of games) {
    const hk = g.league + "|" + g.home, ak = g.league + "|" + g.away;
    const season = g.m >= startM[g.league] ? g.y : g.y - 1;
    const sk = g.league + "|" + season;
    if (seen.get(g.league) !== sk) {
      seen.set(g.league, sk);
      for (const [k, v] of elo) if (k.startsWith(g.league + "|")) elo.set(k, v + (1500 - v) * opt.regress);
      for (const k of [...off.keys()]) if (k.startsWith(g.league + "|")) { off.set(k, 0); def.set(k, 0); gp.set(k, 0); }
    }
    const he = elo.get(hk) ?? 1500, ae = elo.get(ak) ?? 1500;
    let adj = he + opt.home[g.league] - ae;
    const hd = last.get(hk) != null ? (g.t - last.get(hk)) / 86400000 : 7;
    const ad = last.get(ak) != null ? (g.t - last.get(ak)) / 86400000 : 7;
    if (hd < 1.4) adj -= opt.b2b[g.league];
    if (ad < 1.4) adj += opt.b2b[g.league];
    const hgp = gp.get(hk) ?? 0, agp = gp.get(ak) ?? 0;
    if (opt.py && hgp >= 8 && agp >= 8) {
      const exp = pyExp[g.league];
      const hw = (off.get(hk) ** exp) / ((off.get(hk) ** exp) + (def.get(hk) ** exp) || 1);
      const aw = (off.get(ak) ** exp) / ((off.get(ak) ** exp) + (def.get(ak) ** exp) || 1);
      adj += opt.py * (hw - aw) * 400;
    }
    const pickHome = adj >= 0;
    const actualHome = g.hs > g.as;
    if (pickHome === actualHome) hit++;
    const row = (by[g.league] ??= { h: 0, n: 0 });
    row.n++; if (pickHome === actualHome) row.h++;
    const exp = 1 / (1 + 10 ** (-(he + opt.home[g.league] - ae) / 400));
    const k = opt.k[g.league];
    const delta = k * ((actualHome ? 1 : 0) - exp);
    elo.set(hk, he + delta);
    elo.set(ak, ae - delta);
    off.set(hk, (off.get(hk) ?? 0) + g.hs);
    def.set(hk, (def.get(hk) ?? 0) + g.as);
    off.set(ak, (off.get(ak) ?? 0) + g.as);
    def.set(ak, (def.get(ak) ?? 0) + g.hs);
    gp.set(hk, hgp + 1);
    gp.set(ak, agp + 1);
    last.set(hk, g.t);
    last.set(ak, g.t);
  }
  return { hit, n: games.length, by };
}

let best = { pct: 0 };
for (const kb of [4, 6, 8]) for (const kn of [12, 16, 20]) for (const homeN of [50, 70, 90]) for (const py of [0, 40, 80]) {
  const opt = {
    k: { MLB: kb, NFL: kn, NHL: Math.round(kn * 0.7), NBA: kn },
    home: { MLB: 28, NFL: 48, NHL: 35, NBA: homeN },
    b2b: { MLB: 0, NFL: 0, NHL: 25, NBA: 40 },
    regress: 0.2,
    py,
  };
  const r = run(opt);
  const pct = Math.round((1000 * r.hit) / r.n) / 10;
  if (pct > best.pct) best = { pct, opt, by: Object.fromEntries(Object.entries(r.by).map(([k, v]) => [k, Math.round((1000 * v.h) / v.n) / 10])) };
  process.stdout.write(`\r${pct}`);
}
console.log("\nBEST", JSON.stringify(best, null, 2));
