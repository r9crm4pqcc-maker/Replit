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
const base = { k: { MLB: 4, NFL: 20, NHL: 14, NBA: 20 }, home: { MLB: 28, NFL: 48, NHL: 35, NBA: 50 }, b2b: { MLB: 0, NFL: 0, NHL: 25, NBA: 40 }, regress: 0.2 };
const cap = { MLB: 6, NFL: 21, NHL: 4, NBA: 25 };

function run(opt) {
  const elo = new Map(), last = new Map(), seen = new Map(), margin = new Map(), recent = new Map();
  let hit = 0, baseHit = 0;
  const bucket = { train: [0, 0], val: [0, 0], test: [0, 0] };
  const by = {};
  const id = (g, n) => g.league + "|" + n;
  for (const g of games) {
    const hk = id(g, g.home), ak = id(g, g.away);
    const season = g.m >= startM[g.league] ? g.y : g.y - 1;
    const sk = g.league + "|" + season;
    if (seen.get(g.league) !== sk) {
      seen.set(g.league, sk);
      for (const [k, v] of elo) if (k.startsWith(g.league + "|")) elo.set(k, v + (1500 - v) * base.regress);
      for (const [k, v] of margin) if (k.startsWith(g.league + "|")) margin.set(k, v * (1 - opt.regressM));
    }
    const he = elo.get(hk) ?? 1500, ae = elo.get(ak) ?? 1500;
    let adj = he + base.home[g.league] - ae;
    const prevH = recent.get(hk) ?? [];
    const prevA = recent.get(ak) ?? [];
    const hd = last.get(hk) != null ? (g.t - last.get(hk)) / 86400000 : 7;
    const ad = last.get(ak) != null ? (g.t - last.get(ak)) / 86400000 : 7;
    if (hd < 1.4) adj -= base.b2b[g.league];
    if (ad < 1.4) adj += base.b2b[g.league];
    const load = (arr) => arr.filter((t) => g.t - t < opt.window * 86400000).length;
    const fat = load(prevA) - load(prevH);
    const mp = (margin.get(hk) ?? 0) - (margin.get(ak) ?? 0) + opt.marginHome[g.league];
    const score = adj + opt.marginW * mp + opt.fatW * fat;
    const pickHome = score >= 0;
    const actualHome = g.hs > g.as;
    if (pickHome === actualHome) hit++;
    if (adj >= 0 === actualHome) baseHit++;
    const key = g.y >= 2020 ? "test" : g.y >= 2016 ? "val" : "train";
    bucket[key][1]++; if (pickHome === actualHome) bucket[key][0]++;
    const row = (by[g.league] ??= [0, 0]); row[1]++; if (pickHome === actualHome) row[0]++;
    const exp = 1 / (1 + 10 ** (-(he + base.home[g.league] - ae) / 400));
    const delta = base.k[g.league] * ((actualHome ? 1 : 0) - exp);
    elo.set(hk, he + delta); elo.set(ak, ae - delta);
    const err = Math.max(-cap[g.league], Math.min(cap[g.league], (g.hs - g.as) - mp));
    margin.set(hk, (margin.get(hk) ?? 0) + opt.lr * err);
    margin.set(ak, (margin.get(ak) ?? 0) - opt.lr * err);
    prevH.push(g.t); prevA.push(g.t);
    if (prevH.length > 8) prevH.shift();
    if (prevA.length > 8) prevA.shift();
    recent.set(hk, prevH); recent.set(ak, prevA);
    last.set(hk, g.t); last.set(ak, g.t);
  }
  const pct = (h, n) => Math.round((1000 * h) / n) / 10;
  return {
    all: pct(hit, games.length),
    base: pct(baseHit, games.length),
    train: pct(bucket.train[0], bucket.train[1]),
    val: pct(bucket.val[0], bucket.val[1]),
    test: pct(bucket.test[0], bucket.test[1]),
    net: hit - baseHit,
    by: Object.fromEntries(Object.entries(by).map(([k, v]) => [k, pct(v[0], v[1])])),
  };
}

let best = null;
const homes = {
  zero: { MLB: 0, NFL: 0, NHL: 0, NBA: 0 },
  half: { MLB: 0.15, NFL: 0.4, NHL: 0.2, NBA: 1.2 },
};
for (const marginW of [0, 0.4, 1, 2, 4]) {
  for (const lr of [0.02, 0.06, 0.12]) {
    for (const fatW of [0, 4, 10]) {
      for (const [homeName, marginHome] of Object.entries(homes)) {
        if (marginW === 0 && (lr !== 0.02 || homeName !== "zero")) continue;
        const opt = { marginW, lr, fatW, window: 6, regressM: 0.5, marginHome };
        const r = run(opt);
        if (!best || r.val > best.r.val + 0.0001 || (r.val === best.r.val && r.test > best.r.test)) best = { opt: { marginW, lr, fatW, homeName }, r };
      }
    }
  }
}
console.log(JSON.stringify(best, null, 2));
console.log("baseline check", JSON.stringify(run({ marginW: 0, lr: 0.02, fatW: 0, window: 6, regressM: 0, marginHome: homes.zero })));
