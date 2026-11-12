import { createServer } from "vite";
import fs from "node:fs";

const JSONL = "/tmp/feat-games.jsonl";
const STATE = "/tmp/feat-state.json";
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
const ruleMod = await server.ssrLoadModule("/src/lib/sports-rules.ts");
const { runVotes, TEAM_COLORS } = voteMod;
const { getTeamMeta } = dataMod;
const { runOriginal } = learnMod;
const { ruleId } = ruleMod;

const pad = (n) => (n < 10 ? `0${n}` : String(n));
const key = (y, m) => y * 12 + m;
function peel(rec, won) {
  const m = String(rec || "").match(/(\d+)\s*[-–]\s*(\d+)/);
  if (!m) return undefined;
  let w = +m[1], l = +m[2];
  if (won && w > 0) w -= 1;
  else if (!won && l > 0) l -= 1;
  return w + l ? `${w}-${l}` : undefined;
}
function pct(rec) {
  const m = String(rec || "").match(/(\d+)\s*[-–]\s*(\d+)/);
  if (!m) return null;
  const g = +m[1] + +m[2];
  return g ? +m[1] / g : null;
}
function played(rec) {
  const m = String(rec || "").match(/(\d+)\s*[-–]\s*(\d+)/);
  return m ? +m[1] + +m[2] : 0;
}
function bandOf(gap) {
  return gap >= 0.5 ? 50 : gap >= 0.4 ? 40 : gap >= 0.3 ? 30 : gap >= 0.15 ? 15 : 0;
}

let state = { through: [1919, 12] };
if (fs.existsSync(STATE)) state = JSON.parse(fs.readFileSync(STATE, "utf8"));
else fs.writeFileSync(JSONL, "");
const out = fs.createWriteStream(JSONL, { flags: "a" });

function rowFor(ev, league) {
  const comp = ev.competitions?.[0];
  if (!comp || ev.status?.type?.state !== "post") return;
  const home = comp.competitors?.find((c) => c.homeAway === "home");
  const away = comp.competitors?.find((c) => c.homeAway === "away");
  if (!home?.team?.displayName || !away?.team?.displayName) return;
  const hs = Number(home.score), as = Number(away.score);
  if (!Number.isFinite(hs) || !Number.isFinite(as) || hs === as) return;
  const dt = new Date(ev.date);
  if (Number.isNaN(dt.getTime())) return;
  const homeWon = hs > as;
  const homeRec = peel(home.records?.[0]?.summary ?? "", homeWon);
  const awayRec = peel(away.records?.[0]?.summary ?? "", !homeWon);
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
  const homeMeta = getTeamMeta(home.team.displayName);
  const input = {
    year: dt.getUTCFullYear(), month: dt.getUTCMonth() + 1, day: dt.getUTCDate(),
    league, hour: dt.getUTCHours(),
    home: side(home.team.displayName, homeRec),
    away: side(away.team.displayName, awayRec),
    stadium: homeMeta?.stadium, city: homeMeta?.city,
    stadiumOpened: homeMeta?.stadiumOpened, cityFounded: homeMeta?.cityFounded,
  };
  const vote = runOriginal(() => runVotes(input));
  const f = {};
  for (const v of vote.votes) {
    const id = ruleId(v.reason);
    if (id.startsWith("record-gap") || id === "record-tiebreak") continue;
    const signed = v.side === "home" ? v.weight : -v.weight;
    f[id] = Math.round(((f[id] ?? 0) + signed) * 1000) / 1000;
  }
  const hp = pct(homeRec), ap = pct(awayRec);
  let d = null, b = 0, s = 0;
  if (hp != null && ap != null && played(homeRec) >= 8 && played(awayRec) >= 8) {
    d = Math.round((hp - ap) * 1000) / 1000;
    b = bandOf(Math.abs(d));
    s = d > 0 ? 1 : d < 0 ? -1 : 0;
  }
  return { y: dt.getUTCFullYear(), a: homeWon ? 1 : 0, l: league, d, b, s, f };
}

async function pull(league, y, m) {
  const url = `https://site.api.espn.com/apis/site/v2/sports/${league.path}/scoreboard?dates=${y}${pad(m)}&limit=1000`;
  const res = await fetch(url);
  if (!res.ok) return [];
  return (await res.json()).events ?? [];
}

const end = new Date();
const endKey = end.getFullYear() * 12 + (end.getMonth() + 1);
let n = 0;
for (let k = key(state.through[0], state.through[1]) + 1; k <= endKey; k++) {
  const y = Math.floor((k - 1) / 12);
  const m = ((k - 1) % 12) + 1;
  const due = LEAGUES.filter((league) => y >= league.from && league.months.includes(m) && !(league.name === "NBA" && y === 1946 && m < 11));
  const bags = await Promise.all(due.map(async (league) => {
    try { return (await pull(league, y, m)).map((ev) => rowFor(ev, league.name)).filter(Boolean); }
    catch (err) { console.error("miss", league.name, y, m, err.message); return []; }
  }));
  for (const rows of bags) for (const row of rows) { out.write(JSON.stringify(row) + "\n"); n++; }
  state.through = [y, m];
  fs.writeFileSync(STATE, JSON.stringify(state));
  if (due.length && (m === 1 || n % 5000 < 800)) console.log(`${y}-${pad(m)} dumped ${n}`);
}
out.end();
await new Promise((r) => out.on("finish", r));
await server.close();
console.log("DUMPED", n);
