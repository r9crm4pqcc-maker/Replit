import { createServer } from "vite";
import fs from "node:fs";

const OUT = "/workspace/src/lib/sports-history.json";
const LEAGUES = [
  { name: "MLB", path: "baseball/mlb", months: [3, 4, 5, 6, 7, 8, 9, 10, 11], from: 1920 },
  { name: "NFL", path: "football/nfl", months: [1, 2, 9, 10, 11, 12], from: 1920 },
  { name: "NHL", path: "hockey/nhl", months: [1, 2, 3, 4, 5, 6, 10, 11, 12], from: 1920 },
  { name: "NBA", path: "basketball/nba", months: [1, 2, 3, 4, 5, 6, 10, 11, 12], from: 1946 },
];

const server = await createServer({ server: { middlewareMode: true }, appType: "custom", logLevel: "error" });
const voteMod = await server.ssrLoadModule("/src/lib/vote-decode.ts");
const dataMod = await server.ssrLoadModule("/src/lib/sports-data.ts");
const { runVotes, TEAM_COLORS } = voteMod;
const { getTeamMeta } = dataMod;

function load() {
  try { return JSON.parse(fs.readFileSync(OUT, "utf8")); } catch { return { through: [1919, 12], games: 0, hits: 0, layers: {} }; }
}
function save(state) {
  fs.writeFileSync(OUT, JSON.stringify(state));
}
const state = load();

function pad(n) { return n < 10 ? `0${n}` : String(n); }
function key(y, m) { return y * 12 + m; }

function grade(ev, league) {
  const comp = ev.competitions?.[0];
  if (!comp || ev.status?.type?.state !== "post") return;
  const home = comp.competitors?.find((c) => c.homeAway === "home");
  const away = comp.competitors?.find((c) => c.homeAway === "away");
  if (!home?.team?.displayName || !away?.team?.displayName) return;
  const hs = Number(home.score);
  const as = Number(away.score);
  if (!Number.isFinite(hs) || !Number.isFinite(as) || hs === as) return;
  const dt = new Date(ev.date);
  if (Number.isNaN(dt.getTime())) return;
  const y = dt.getUTCFullYear();
  const m = dt.getUTCMonth() + 1;
  const d = dt.getUTCDate();
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
    year: y, month: m, day: d, league, hour: dt.getUTCHours(),
    home: side(home.team.displayName, home.records?.[0]?.summary ?? ""),
    away: side(away.team.displayName, away.records?.[0]?.summary ?? ""),
    stadium: getTeamMeta(home.team.displayName)?.stadium,
    city: getTeamMeta(home.team.displayName)?.city,
    stadiumOpened: getTeamMeta(home.team.displayName)?.stadiumOpened,
    cityFounded: getTeamMeta(home.team.displayName)?.cityFounded,
  });
  const actual = hs > as ? "home" : "away";
  state.games++;
  if (vote.pick === actual) state.hits++;
  const layers = new Set(vote.votes.map((v) => v.layer));
  for (const layer of layers) {
    const w = { home: 0, away: 0 };
    for (const v of vote.votes) if (v.layer === layer) w[v.side] += v.weight;
    if (w.home === w.away) continue;
    const row = state.layers[layer] ?? { hits: 0, total: 0 };
    row.total++;
    if ((w.home > w.away ? "home" : "away") === actual) row.hits++;
    state.layers[layer] = row;
  }
}

async function pull(league, y, m) {
  const url = `https://site.api.espn.com/apis/site/v2/sports/${league.path}/scoreboard?dates=${y}${pad(m)}&limit=1000`;
  const res = await fetch(url);
  if (!res.ok) return [];
  const json = await res.json();
  return json.events ?? [];
}

const end = new Date();
const endKey = end.getFullYear() * 12 + (end.getMonth() + 1);
const startKey = key(state.through[0], state.through[1]) + 1;

for (let k = startKey; k <= endKey; k++) {
  const y = Math.floor((k - 1) / 12);
  const m = ((k - 1) % 12) + 1;
  const due = LEAGUES.filter((league) => y >= league.from && league.months.includes(m) && !(league.name === "NBA" && y === 1946 && m < 11));
  await Promise.all(due.map(async (league) => {
    try {
      const events = await pull(league, y, m);
      for (const ev of events) grade(ev, league.name);
    } catch (err) {
      console.error("miss", league.name, y, m, err.message);
    }
  }));
  state.through = [y, m];
  save(state);
  if (due.length) console.log(`${y}-${pad(m)} games ${state.games} hit ${state.games ? Math.round((100 * state.hits) / state.games) : 0}%`);
}
console.log("DONE", state.games, state.hits);
await server.close();
