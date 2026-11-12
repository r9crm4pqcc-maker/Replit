import { createServer } from "vite";
import fs from "node:fs";

const OUT = "/tmp/learned-rerun.json";
const LEAGUES = [
  { name: "MLB", path: "baseball/mlb", months: [3, 4, 5, 6, 7, 8, 9, 10, 11], from: 1920 },
  { name: "NFL", path: "football/nfl", months: [1, 2, 9, 10, 11, 12], from: 1920 },
  { name: "NHL", path: "hockey/nhl", months: [1, 2, 3, 4, 5, 6, 10, 11, 12], from: 1920 },
  { name: "NBA", path: "basketball/nba", months: [1, 2, 3, 4, 5, 6, 10, 11, 12], from: 1946 },
];

const server = await createServer({ server: { middlewareMode: true }, appType: "custom", logLevel: "error" });
const voteMod = await server.ssrLoadModule("/src/lib/vote-decode.ts");
const dataMod = await server.ssrLoadModule("/src/lib/sports-data.ts");
const learnMod = await server.ssrLoadModule("/src/lib/sports-learning.ts");
const { runVotes, TEAM_COLORS } = voteMod;
const { getTeamMeta } = dataMod;
const { runOriginal } = learnMod;

function load() {
  try { return JSON.parse(fs.readFileSync(OUT, "utf8")); } catch {
    return { through: [1919, 12], learned: { g: 0, h: 0 }, original: { g: 0, h: 0 }, peeled: { g: 0, h: 0 } };
  }
}
function save(state) { fs.writeFileSync(OUT, JSON.stringify(state)); }
const state = load();
const pad = (n) => (n < 10 ? `0${n}` : String(n));
const key = (y, m) => y * 12 + m;
const pct = (r) => { const m = String(r || "").match(/(\d+)\s*[-–]\s*(\d+)/); if (!m) return null; const g = +m[1] + +m[2]; return g ? +m[1] / g : null; };
function peel(rec, won) {
  const m = String(rec || "").match(/(\d+)\s*[-–]\s*(\d+)/);
  if (!m) return undefined;
  let w = +m[1], l = +m[2];
  if (won && w > 0) w -= 1;
  else if (!won && l > 0) l -= 1;
  return w + l ? `${w}-${l}` : undefined;
}
function inputFor(ev, league, homeRec, awayRec) {
  const comp = ev.competitions?.[0];
  const home = comp.competitors.find((c) => c.homeAway === "home");
  const away = comp.competitors.find((c) => c.homeAway === "away");
  const dt = new Date(ev.date);
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
  return {
    year: dt.getUTCFullYear(), month: dt.getUTCMonth() + 1, day: dt.getUTCDate(),
    league, hour: dt.getUTCHours(),
    home: side(home.team.displayName, homeRec),
    away: side(away.team.displayName, awayRec),
    stadium: getTeamMeta(home.team.displayName)?.stadium,
    city: getTeamMeta(home.team.displayName)?.city,
    stadiumOpened: getTeamMeta(home.team.displayName)?.stadiumOpened,
    cityFounded: getTeamMeta(home.team.displayName)?.cityFounded,
  };
}
function grade(ev, league) {
  const comp = ev.competitions?.[0];
  if (!comp || ev.status?.type?.state !== "post") return;
  const home = comp.competitors?.find((c) => c.homeAway === "home");
  const away = comp.competitors?.find((c) => c.homeAway === "away");
  if (!home?.team?.displayName || !away?.team?.displayName) return;
  const hs = Number(home.score), as = Number(away.score);
  if (!Number.isFinite(hs) || !Number.isFinite(as) || hs === as) return;
  if (Number.isNaN(new Date(ev.date).getTime())) return;
  const actual = hs > as ? "home" : "away";
  const homeRec = home.records?.[0]?.summary ?? "";
  const awayRec = away.records?.[0]?.summary ?? "";
  const learned = runVotes(inputFor(ev, league, homeRec, awayRec));
  const original = runOriginal(() => runVotes(inputFor(ev, league, homeRec, awayRec)));
  const peeled = runVotes(inputFor(ev, league, peel(homeRec, actual === "home"), peel(awayRec, actual === "away")));
  state.learned.g++; if (learned.pick === actual) state.learned.h++;
  state.original.g++; if (original.pick === actual) state.original.h++;
  state.peeled.g++; if (peeled.pick === actual) state.peeled.h++;
}
async function pull(league, y, m) {
  const url = `https://site.api.espn.com/apis/site/v2/sports/${league.path}/scoreboard?dates=${y}${pad(m)}&limit=1000`;
  const res = await fetch(url);
  if (!res.ok) return [];
  const json = await res.json();
  return json.events ?? [];
}
const rate = (x) => (x.g ? Math.round((1000 * x.h) / x.g) / 10 : 0);
const end = new Date();
const endKey = end.getFullYear() * 12 + (end.getMonth() + 1);
for (let k = key(state.through[0], state.through[1]) + 1; k <= endKey; k++) {
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
  if (due.length) console.log(`${y}-${pad(m)} n ${state.learned.g} learned ${rate(state.learned)}% original ${rate(state.original)}% peeled ${rate(state.peeled)}%`);
}
console.log("DONE", JSON.stringify({ n: state.learned.g, learned: rate(state.learned), original: rate(state.original), peeled: rate(state.peeled) }));
await server.close();
