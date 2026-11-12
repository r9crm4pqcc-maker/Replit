import { createServer } from "vite";
import fs from "node:fs";

const server = await createServer({ server: { middlewareMode: true }, appType: "custom", logLevel: "error" });
const voteMod = await server.ssrLoadModule("/src/lib/vote-decode.ts");
const dataMod = await server.ssrLoadModule("/src/lib/sports-data.ts");
const fullMod = await server.ssrLoadModule("/src/lib/full-decode.ts");
const decodeMod = await server.ssrLoadModule("/src/components/FullDecode.tsx");
const { runVotes, TEAM_COLORS } = voteMod;
const { getTeamMeta } = dataMod;
const { computeFullDecode } = decodeMod;

const games = [];
for (const line of fs.readFileSync("/tmp/elo-games.jsonl", "utf8").replace(/\r?\n (?=\S)/g, " ").split("\n")) {
  if (!line) continue;
  const [date, league, home, away, hs, as] = line.split("\t");
  const t = Date.parse(date);
  if (!Number.isFinite(t) || !home || !away) continue;
  const dt = new Date(t);
  if (dt.getUTCFullYear() < 2024) continue;
  games.push({ y: dt.getUTCFullYear(), m: dt.getUTCMonth() + 1, d: dt.getUTCDate(), h: dt.getUTCHours(), league, home, away, hs: +hs, as: +as });
}
let n = 0, flip = 0, flipRight = 0, ratingRight = 0, cardRight = 0;
for (const g of games) {
  const meta = (name) => getTeamMeta(name);
  const hm = meta(g.home), am = meta(g.away);
  const side = (name, m) => ({ name, founded: m?.founded ? [m.founded[0], m.founded[1], m.founded[2]] : undefined, colors: TEAM_COLORS[name], people: [] });
  const v = runVotes({ year: g.y, month: g.m, day: g.d, hour: g.h, league: g.league, home: side(g.home, hm), away: side(g.away, am), stadium: hm?.stadium, city: hm?.city, stadiumOpened: hm?.stadiumOpened, cityFounded: hm?.cityFounded });
  const tri = (d) => (d ? [d[0], d[1], d[2]] : undefined);
  const full = computeFullDecode([
    { kind: "team", side: "away", name: g.away, date: tri(am?.founded) },
    { kind: "team", side: "home", name: g.home, date: tri(hm?.founded) },
    { kind: "city", side: "venue", name: hm?.city ?? "Host city", date: tri(hm?.cityFounded) },
    { kind: "stadium", side: "venue", name: hm?.stadium ?? "Stadium", date: tri(hm?.stadiumOpened) },
  ], [g.y, g.m, g.d], g.h, {});
  const cardHome = v.home + full.home >= v.away + full.away;
  const actualHome = g.hs > g.as;
  n++;
  if (v.pick === "home" ? actualHome : !actualHome) ratingRight++;
  if (cardHome === actualHome) cardRight++;
  if ((v.pick === "home") !== cardHome) {
    flip++;
    if (cardHome === actualHome) flipRight++;
  }
}
await server.close();
const pct = (h) => Math.round((1000 * h) / n) / 10;
console.log({ n, rating: pct(ratingRight), card: pct(cardRight), flips: flip, flipsRight: flipRight, netIfStopAdding: ratingRight - cardRight });
