import { createServer } from "vite";
import fs from "node:fs";

const OUT = "/workspace/src/lib/sports-rules.json";
const LEAGUES = [
  { name: "MLB", path: "baseball/mlb", months: [3, 4, 5, 6, 7, 8, 9, 10, 11] },
  { name: "NFL", path: "football/nfl", months: [1, 2, 9, 10, 11, 12] },
  { name: "NHL", path: "hockey/nhl", months: [1, 2, 3, 4, 5, 6, 10, 11, 12] },
  { name: "NBA", path: "basketball/nba", months: [1, 2, 3, 4, 5, 6, 10, 11, 12] },
];

const server = await createServer({ server: { middlewareMode: true }, appType: "custom", logLevel: "error" });
const voteMod = await server.ssrLoadModule("/src/lib/vote-decode.ts");
const dataMod = await server.ssrLoadModule("/src/lib/sports-data.ts");
const rulesMod = await server.ssrLoadModule("/src/lib/sports-rules.ts");
const { runVotes, TEAM_COLORS } = voteMod;
const { getTeamMeta } = dataMod;
const { ruleId } = rulesMod;

function pad(n) { return n < 10 ? `0${n}` : String(n); }

const games = [];
const tally = {};
function bump(id, hit) {
  const row = tally[id] ?? { hits: 0, total: 0 };
  row.total++;
  if (hit) row.hits++;
  tally[id] = row;
}

function take(ev, league) {
  const comp = ev.competitions?.[0];
  if (!comp || ev.status?.type?.state !== "post") return;
  const home = comp.competitors?.find((c) => c.homeAway === "home");
  const away = comp.competitors?.find((c) => c.homeAway === "away");
  if (!home?.team?.displayName || !away?.team?.displayName) return;
  const hs = Number(home.score), as = Number(away.score);
  if (!Number.isFinite(hs) || !Number.isFinite(as) || hs === as) return;
  const dt = new Date(ev.date);
  if (Number.isNaN(dt.getTime())) return;
  const side = (name, rec) => {
    const meta = getTeamMeta(name);
    return {
      name,
      founded: meta?.founded ? [meta.founded[0], meta.founded[1], meta.founded[2]] : undefined,
      colors: TEAM_COLORS[name],
      record: rec || undefined,
      people: [],
    };
  };
  const vote = runVotes({
    year: dt.getUTCFullYear(), month: dt.getUTCMonth() + 1, day: dt.getUTCDate(), league, hour: dt.getUTCHours(),
    home: side(home.team.displayName, home.records?.[0]?.summary ?? ""),
    away: side(away.team.displayName, away.records?.[0]?.summary ?? ""),
    stadium: getTeamMeta(home.team.displayName)?.stadium,
    city: getTeamMeta(home.team.displayName)?.city,
    stadiumOpened: getTeamMeta(home.team.displayName)?.stadiumOpened,
    cityFounded: getTeamMeta(home.team.displayName)?.cityFounded,
  });
  const actual = hs > as ? "home" : "away";
  const packed = [];
  for (const v of vote.votes) {
    if (v.reason.startsWith("Tiebreaker")) continue;
    const id = ruleId(v.reason);
    const hit = v.side === actual;
    bump(id, hit);
    packed.push([id, v.side === "home" ? 1 : 0, v.weight]);
  }
  games.push([actual === "home" ? 1 : 0, packed]);
}

async function pull(league, y, m) {
  const url = `https://site.api.espn.com/apis/site/v2/sports/${league.path}/scoreboard?dates=${y}${pad(m)}&limit=1000`;
  const res = await fetch(url);
  if (!res.ok) return [];
  const json = await res.json();
  return json.events ?? [];
}

for (let y = 2016; y <= 2025; y++) {
  for (let m = 1; m <= 12; m++) {
    const due = LEAGUES.filter((lg) => lg.months.includes(m));
    await Promise.all(due.map(async (league) => {
      try {
        const events = await pull(league, y, m);
        for (const ev of events) take(ev, league.name);
      } catch (err) {
        console.error("miss", league.name, y, m, err.message);
      }
    }));
    console.log(`${y}-${pad(m)} games ${games.length}`);
  }
}

const scored = Object.entries(tally).map(([id, row]) => {
  const pct = row.total ? Math.round((1000 * row.hits) / row.total) / 10 : 0;
  const weight = row.total >= 100 && pct > 52 ? Math.round(((pct - 50) / 8) * 100) / 100 : 0;
  return [id, { hits: row.hits, total: row.total, pct, weight }];
}).sort((a, b) => b[1].pct - a[1].pct);

function accuracy(weightOf) {
  let hits = 0;
  for (const [actual, packed] of games) {
    let home = 0, away = 0;
    for (const [id, sideHome, w] of packed) {
      const m = weightOf(id);
      const ww = w * m;
      if (sideHome) home += ww; else away += ww;
    }
    if (home === away) continue;
    if ((home > away ? 1 : 0) === actual) hits++;
  }
  return hits;
}
const decided = games.filter((g) => {
  let home = 0, away = 0;
  for (const [id, sideHome, w] of g[1]) {
    const ww = w * (Object.fromEntries(scored)[id]?.weight ?? 0);
    if (sideHome) home += ww; else away += ww;
  }
  return home !== away;
}).length;
const keptHits = accuracy((id) => Object.fromEntries(scored)[id]?.weight ?? 0);
const baseHits = accuracy(() => 1);
const out = Object.fromEntries(scored);
fs.writeFileSync(OUT, JSON.stringify(out, null, 2));
console.log("BASE", baseHits, "/", games.length, Math.round(100 * baseHits / games.length) + "%");
console.log("KEPT", keptHits, "/", decided, "decided of", games.length, decided ? Math.round(100 * keptHits / decided) + "%" : "");
console.log(scored.map(([id, r]) => `${id} ${r.pct}% n=${r.total} w=${r.weight}`).join("\n"));
await server.close();
