import fs from "node:fs";

const JSONL = "/tmp/elo-games.jsonl";
const STATE = "/tmp/elo-state.json";
const LEAGUES = [
  { name: "MLB", path: "baseball/mlb", months: [3, 4, 5, 6, 7, 8, 9, 10, 11], from: 1920, seasonStart: 3 },
  { name: "NFL", path: "football/nfl", months: [1, 2, 9, 10, 11, 12], from: 1920, seasonStart: 8 },
  { name: "NHL", path: "hockey/nhl", months: [1, 2, 3, 4, 5, 6, 10, 11, 12], from: 1920, seasonStart: 9 },
  { name: "NBA", path: "basketball/nba", months: [1, 2, 3, 4, 5, 6, 10, 11, 12], from: 1946, seasonStart: 9 },
];
const pad = (n) => (n < 10 ? `0${n}` : String(n));
const key = (y, m) => y * 12 + m;

async function dump() {
  let state = { through: [1919, 12] };
  if (fs.existsSync(STATE)) state = JSON.parse(fs.readFileSync(STATE, "utf8"));
  else fs.writeFileSync(JSONL, "");
  if (state.through[0] > 2026 || (state.through[0] === 2026 && state.through[1] >= 11)) return;
  const out = fs.createWriteStream(JSONL, { flags: "a" });
  const end = new Date();
  const endKey = end.getFullYear() * 12 + (end.getMonth() + 1);
  let n = 0;
  for (let k = key(state.through[0], state.through[1]) + 1; k <= endKey; k++) {
    const y = Math.floor((k - 1) / 12);
    const m = ((k - 1) % 12) + 1;
    const due = LEAGUES.filter((lg) => y >= lg.from && lg.months.includes(m) && !(lg.name === "NBA" && y === 1946 && m < 11));
    const bags = await Promise.all(due.map(async (lg) => {
      try {
        const res = await fetch(`https://site.api.espn.com/apis/site/v2/sports/${lg.path}/scoreboard?dates=${y}${pad(m)}&limit=1000`);
        if (!res.ok) return [];
        const events = (await res.json()).events ?? [];
        const rows = [];
        for (const ev of events) {
          const comp = ev.competitions?.[0];
          if (!comp || ev.status?.type?.state !== "post") continue;
          const home = comp.competitors?.find((c) => c.homeAway === "home");
          const away = comp.competitors?.find((c) => c.homeAway === "away");
          const hs = Number(home?.score), as = Number(away?.score);
          if (!home?.team?.displayName || !away?.team?.displayName) continue;
          if (!Number.isFinite(hs) || !Number.isFinite(as) || hs === as) continue;
          rows.push([ev.date, lg.name, home.team.displayName, away.team.displayName, hs, as].join("\t"));
        }
        return rows;
      } catch (err) {
        console.error("miss", lg.name, y, m, err.message);
        return [];
      }
    }));
    for (const rows of bags) for (const line of rows) { out.write(line + "\n"); n++; }
    state.through = [y, m];
    fs.writeFileSync(STATE, JSON.stringify(state));
    if (due.length && m === 7) console.log(`${y} dumped ~${n}`);
  }
  out.end();
  await new Promise((r) => out.on("finish", r));
  console.log("DUMPED", n);
}

function load() {
  const games = [];
  for (const line of fs.readFileSync(JSONL, "utf8").split("\n")) {
    if (!line) continue;
    const [date, league, home, away, hs, as] = line.split("\t");
    const t = Date.parse(date);
    if (!Number.isFinite(t)) continue;
    games.push({ t, y: new Date(t).getUTCFullYear(), m: new Date(t).getUTCMonth() + 1, league, home, away, hs: +hs, as: +as });
  }
  games.sort((a, b) => a.t - b.t || a.home.localeCompare(b.home));
  return games;
}

function seasonKey(g) {
  const start = { MLB: 3, NFL: 8, NHL: 9, NBA: 9 }[g.league];
  return g.m >= start ? g.y : g.y - 1;
}

function replay(games, opt) {
  const elo = new Map();
  const last = new Map();
  const seen = new Map();
  const id = (g, name) => g.league + "|" + name;
  const get = (k) => elo.get(k) ?? 1500;
  let hit = 0, n = 0;
  const by = {};
  const buckets = { big: [0, 0], mid: [0, 0], small: [0, 0] };
  const ratings = {};
  for (const g of games) {
    const hk = id(g, g.home), ak = id(g, g.away);
    const sk = g.league + "|" + seasonKey(g);
    if (seen.get(g.league) !== sk) {
      seen.set(g.league, sk);
      if (opt.regress) {
        for (const [k, v] of elo) if (k.startsWith(g.league + "|")) elo.set(k, v + (1500 - v) * opt.regress);
      }
    }
    const he = get(hk), ae = get(ak);
    const homeAdv = opt.home[g.league] ?? 0;
    let adj = he + homeAdv - ae;
    const hd = last.get(hk) != null ? (g.t - last.get(hk)) / 86400000 : 7;
    const ad = last.get(ak) != null ? (g.t - last.get(ak)) / 86400000 : 7;
    if (hd < 1.4) adj -= opt.b2b;
    if (ad < 1.4) adj += opt.b2b;
    const pickHome = adj >= 0;
    const actualHome = g.hs > g.as;
    n++;
    const ok = pickHome === actualHome;
    if (ok) hit++;
    const row = (by[g.league] ??= { h: 0, n: 0 });
    row.n++; if (ok) row.h++;
    const mag = Math.abs(adj);
    const slot = mag >= 150 ? buckets.big : mag >= 70 ? buckets.mid : buckets.small;
    slot[1]++; if (ok) slot[0]++;
    const exp = 1 / (1 + 10 ** (-adj / 400));
    const margin = Math.abs(g.hs - g.as);
    const mov = opt.mov ? (margin + 3) ** 0.8 / (7.5 + 0.006 * Math.abs(he - ae)) : 1;
    const k = opt.k[g.league] ?? opt.k.MLB;
    const delta = k * mov * ((actualHome ? 1 : 0) - exp);
    elo.set(hk, he + delta);
    elo.set(ak, ae - delta);
    last.set(hk, g.t);
    last.set(ak, g.t);
  }
  for (const [k, v] of elo) {
    const [league, name] = [k.slice(0, k.indexOf("|")), k.slice(k.indexOf("|") + 1)];
    (ratings[league] ??= {})[name] = Math.round(v);
  }
  const pct = (h, c) => (c ? Math.round((1000 * h) / c) / 10 : 0);
  return {
    n, pct: pct(hit, n),
    by: Object.fromEntries(Object.entries(by).map(([k, v]) => [k, { n: v.n, pct: pct(v.h, v.n) }])),
    buckets: Object.fromEntries(Object.entries(buckets).map(([k, v]) => [k, { n: v[1], pct: pct(v[0], v[1]) }])),
    ratings,
  };
}

await dump();
const games = load();
console.log("games", games.length);
const base = { k: { MLB: 6, NFL: 20, NHL: 12, NBA: 20 }, home: { MLB: 24, NFL: 48, NHL: 40, NBA: 100 }, b2b: 0, regress: 0.25, mov: true };
let best = { pct: 0 };
const ks = [4, 6, 8, 12];
const homes = [20, 40, 70, 100];
for (const k of ks) for (const home of homes) for (const regress of [0, 0.2, 0.35]) for (const mov of [false, true]) for (const b2b of [0, 30, 60]) {
  const opt = {
    k: { MLB: k, NFL: k * 2, NHL: k + 4, NBA: k * 2 },
    home: { MLB: home * 0.4, NFL: home * 0.7, NHL: home * 0.5, NBA: home },
    b2b, regress, mov,
  };
  const r = replay(games, opt);
  if (r.pct > best.pct) best = { ...r, opt, ratings: r.ratings };
}
console.log(JSON.stringify({ n: best.n, pct: best.pct, by: best.by, buckets: best.buckets, opt: best.opt }, null, 2));
fs.writeFileSync("/tmp/elo-best.json", JSON.stringify({ pct: best.pct, by: best.by, buckets: best.buckets, opt: best.opt }));
fs.writeFileSync("src/lib/team-ratings.json", JSON.stringify(best.ratings));
