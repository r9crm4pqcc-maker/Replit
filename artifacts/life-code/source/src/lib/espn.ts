// ESPN scoreboard integration with numerology-driven game-energy analysis.
// Reweighted scoring uses the ShemUniverse compatibility matrix
// (lifepath × lifepath), lunar bias, trine alignment, and name-number harmony.

import { calcDateEnergy } from "./numerology";
import { lifePath, foundingPath, nameNumber, compatPoints, compatTier, sameTrine, moonPhase, universalYear, chineseYear as czYear, westernSign } from "./sports-decode";
import { getTeamMeta } from "./sports-data";

/** Route ESPN calls through our same-origin proxy (ESPN sends no CORS headers). */
export function espnFetch(url: string): Promise<Response> {
  return fetch(`/api/public/espn?url=${encodeURIComponent(url)}`);
}

// Chinese zodiac allies (San He triangles) and clashes (Liu Chong opposites)
const CZ_ALLIES: string[][] = [
  ["Rat", "Dragon", "Monkey"],
  ["Ox", "Snake", "Rooster"],
  ["Tiger", "Horse", "Dog"],
  ["Rabbit", "Goat", "Pig"],
];
const CZ_CLASHES: Record<string, string> = {
  Rat: "Horse", Horse: "Rat",
  Ox: "Goat", Goat: "Ox",
  Tiger: "Monkey", Monkey: "Tiger",
  Rabbit: "Rooster", Rooster: "Rabbit",
  Dragon: "Dog", Dog: "Dragon",
  Snake: "Pig", Pig: "Snake",
};
function czRelation(a: string, b: string): "ally" | "clash" | "same" | "neutral" {
  if (!a || !b) return "neutral";
  if (a === b) return "same";
  if (CZ_CLASHES[a] === b) return "clash";
  for (const grp of CZ_ALLIES) if (grp.includes(a) && grp.includes(b)) return "ally";
  return "neutral";
}

// Western element compatibility (Fire↔Air, Earth↔Water are friendly)
const ELEMENT_FRIENDS: Record<string, string[]> = {
  Fire: ["Fire", "Air"],
  Air: ["Air", "Fire"],
  Earth: ["Earth", "Water"],
  Water: ["Water", "Earth"],
};

export interface OddsBlock {
  spreadHome?: string;
  spreadAway?: string;
  moneylineHome?: string;
  moneylineAway?: string;
  overUnder?: string;
  book?: string;
}

export interface ESPNGame {
  id: string;
  league: string;
  status: "pre" | "in" | "post";
  statusDetail: string;
  startTime: string;
  homeTeam: string;
  homeTeamId?: string;
  homeAbbr: string;
  homeRecord: string;
  homeScore: string;
  homeLogo?: string;
  awayTeam: string;
  awayTeamId?: string;
  awayAbbr: string;
  awayRecord: string;
  awayScore: string;
  awayLogo?: string;
  venue?: string;
  broadcast?: string;
  odds: OddsBlock;
  /** Starting / featured player names per side, in priority order. */
  homeLeaders?: string[];
  awayLeaders?: string[];
}

export interface ESPNPlayer {
  id: string;
  fullName: string;
  position?: string;
  jersey?: string;
  dob?: string; // ISO date string
  starRating?: number;
}


export interface TeamHarmonyResult {
  harmony: "CHEAT CODE" | "STRONG CODE" | "LEAN" | "FADE";
  score: number;
  imprint: number;
}

export interface BetPick {
  side: string;
  reason: string;
  odds: number | string;
}

export interface GameEnergyResult {
  predictedWinner: "home" | "away";
  confidence: number;
  parlayWorthy: boolean;
  overUnder: string;
  home: TeamHarmonyResult;
  away: TeamHarmonyResult;
  dateEnergy: number;
  dateDigits: number[];
  dateCompound: number;
  datePairs: string[];
  betCard: BetPick;
  spreadPick: BetPick;
  totalPickObject: BetPick;
}


interface LeagueConfig {
  label: string;
  espnPath: string;
  emoji?: string;
}

const LEAGUE_MAP: Record<string, LeagueConfig> = {
  NBA: { label: "NBA", espnPath: "basketball/nba", emoji: "🏀" },
  WNBA: { label: "WNBA", espnPath: "basketball/wnba", emoji: "🏀" },
  NFL: { label: "NFL", espnPath: "football/nfl", emoji: "🏈" },
  MLB: { label: "MLB", espnPath: "baseball/mlb", emoji: "⚾" },
  NHL: { label: "NHL", espnPath: "hockey/nhl", emoji: "🏒" },
  UFC: { label: "UFC", espnPath: "mma/ufc", emoji: "🥊" },
  MLS: { label: "MLS", espnPath: "soccer/usa.1", emoji: "⚽" },
  "Premier League": { label: "Premier League", espnPath: "soccer/eng.1", emoji: "⚽" },
  "La Liga": { label: "La Liga", espnPath: "soccer/esp.1", emoji: "⚽" },
  Bundesliga: { label: "Bundesliga", espnPath: "soccer/ger.1", emoji: "⚽" },
  "Serie A": { label: "Serie A", espnPath: "soccer/ita.1", emoji: "⚽" },
  "Ligue 1": { label: "Ligue 1", espnPath: "soccer/fra.1", emoji: "⚽" },
  UCL: { label: "UEFA Champions League", espnPath: "soccer/uefa.champions", emoji: "🏆" },
  UEL: { label: "UEFA Europa League", espnPath: "soccer/uefa.europa", emoji: "🏆" },
  UECL: { label: "UEFA Conference League", espnPath: "soccer/uefa.europa.conf", emoji: "🏆" },
  "Liga MX": { label: "Liga MX", espnPath: "soccer/mex.1", emoji: "⚽" },
  "World Cup": { label: "FIFA World Cup 2026", espnPath: "soccer/fifa.world", emoji: "🌍" },
  "College Football": { label: "College Football", espnPath: "football/college-football", emoji: "🏈" },
  "College Basketball": { label: "College Basketball", espnPath: "basketball/mens-college-basketball", emoji: "🏀" },
};

export function getLeagueInfo(league: string): LeagueConfig {
  return LEAGUE_MAP[league] ?? { label: league, espnPath: "" };
}

function pad(n: number): string {
  return n < 10 ? `0${n}` : `${n}`;
}

function formatDate(year: number, month: number, day: number): string {
  return `${year}${pad(month)}${pad(day)}`;
}

interface ESPNAthleteRef {
  displayName?: string;
  fullName?: string;
}
interface ESPNLeaderGroup {
  leaders?: { athlete?: ESPNAthleteRef }[];
}
interface ESPNProbable {
  athlete?: ESPNAthleteRef;
  playerId?: string | number;
}
interface ESPNCompetitor {
  id?: string;
  homeAway: "home" | "away";
  team: { id?: string; displayName: string; abbreviation: string; logo?: string };
  score?: string;
  records?: { summary: string }[];
  leaders?: ESPNLeaderGroup[];
  probables?: ESPNProbable[];
}


interface ESPNCompetition {
  competitors: ESPNCompetitor[];
  venue?: { fullName?: string };
  broadcasts?: { names?: string[] }[];
  odds?: {
    provider?: { name?: string };
    details?: string;
    overUnder?: number;
    homeTeamOdds?: { moneyLine?: number };
    awayTeamOdds?: { moneyLine?: number };
    moneyline?: { home?: { close?: { odds?: string } }; away?: { close?: { odds?: string } } };
    pointSpread?: { home?: { close?: { line?: string } }; away?: { close?: { line?: string } } };
  }[];
}

interface ESPNEvent {
  id: string;
  date: string;
  status?: { type?: { state?: string; shortDetail?: string } };
  competitions: ESPNCompetition[];
}

interface ESPNScoreboardPayload {
  events?: ESPNEvent[];
  content?: { sbData?: { events?: ESPNEvent[] } };
}

function eventFallsOn(iso: string | undefined, dates: string): boolean {
  if (!iso) return false;
  const dt = new Date(iso);
  if (Number.isNaN(dt.getTime())) return false;
  const [start, end] = dates.split("-");
  const compact = (ymd: string) => ymd.replace(/-/g, "");
  const utc = compact(iso.slice(0, 10));
  const et = compact(new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/New_York", year: "numeric", month: "2-digit", day: "2-digit",
  }).format(dt));
  const hit = (ymd: string) => (end ? ymd >= start && ymd <= end : ymd === start);
  return hit(utc) || hit(et);
}

async function fetchScoreboardEvents(league: string, path: string, dates: string): Promise<ESPNEvent[]> {
  const primary = `https://site.api.espn.com/apis/site/v2/sports/${path}/scoreboard?dates=${dates}&limit=100`;
  try {
    const res = await espnFetch(primary);
    if (res.ok) {
      const data = (await res.json()) as ESPNScoreboardPayload;
      // An empty slate is a real off-day. Do not replace it with another feed.
      return data.events ?? data.content?.sbData?.events ?? [];
    }
  } catch {
    // Primary feed failed. MLB can try the CDN board, then keep only this date.
  }
  if (league !== "MLB") return [];
  try {
    const res = await espnFetch(`https://cdn.espn.com/core/mlb/scoreboard?xhr=1&dates=${dates}`);
    if (!res.ok) return [];
    const data = (await res.json()) as ESPNScoreboardPayload;
    const events = data.events ?? data.content?.sbData?.events ?? [];
    return events.filter((ev) => eventFallsOn(ev.date, dates));
  } catch {
    return [];
  }
}

export async function fetchESPNMonth(league: string, year: number, month: number): Promise<ESPNGame[]> {
  const cfg = getLeagueInfo(league);
  if (!cfg.espnPath) return [];
  const dates = `${year}${pad(month)}`;
  const events = await fetchScoreboardEvents(league, cfg.espnPath, dates);
  if (league === "UFC") return [];
  return events.map((ev) => mapEvent(ev, league)).filter(Boolean) as ESPNGame[];
}

export async function fetchESPNGamesRange(
  league: string,
  start: { year: number; month: number; day: number },
  end: { year: number; month: number; day: number },
): Promise<ESPNGame[]> {
  const cfg = getLeagueInfo(league);
  if (!cfg.espnPath) return [];
  const range = `${formatDate(start.year, start.month, start.day)}-${formatDate(end.year, end.month, end.day)}`;
  const events = await fetchScoreboardEvents(league, cfg.espnPath, range);
  return events.map((ev) => mapEvent(ev, league)).filter(Boolean) as ESPNGame[];
}

export async function fetchESPNGames(
  league: string,
  month: number,
  day: number,
  year: number,
): Promise<ESPNGame[]> {
  const cfg = getLeagueInfo(league);
  if (!cfg.espnPath) return [];

  const events = await fetchScoreboardEvents(league, cfg.espnPath, formatDate(year, month, day));
  if (league === "UFC") return events.flatMap((ev: any) => mapFights(ev));
  return events.map((ev) => mapEvent(ev, league)).filter(Boolean) as ESPNGame[];
}

/** UFC: each bout on the card becomes one "game"; red corner (order 1) = home. */
function mapFights(ev: any): ESPNGame[] {
  return (ev.competitions ?? []).map((c: any, i: number) => {
    const sorted = [...(c.competitors ?? [])].sort((a: any, b: any) => (a.order ?? 0) - (b.order ?? 0));
    const [h, a] = sorted; if (!h || !a) return null;
    const st = c.status?.type?.state ?? ev.status?.type?.state ?? "pre";
    const rec = (x: any) => x.records?.find((r: any) => r.type === "total")?.summary ?? x.records?.[0]?.summary ?? "";
    return {
      id: String(c.id ?? `${ev.id}-${i}`), league: "UFC",
      status: st === "in" ? "in" : st === "post" ? "post" : "pre",
      statusDetail: `${c.type?.abbreviation ?? "Bout"} · ${ev.name ?? ""}`, startTime: c.date ?? ev.date,
      homeTeam: h.athlete?.displayName ?? "Fighter A", homeTeamId: String(h.id), homeAbbr: h.athlete?.shortName ?? "", homeRecord: rec(h),
      homeScore: st === "post" ? (h.winner ? "1" : "0") : "",
      awayTeam: a.athlete?.displayName ?? "Fighter B", awayTeamId: String(a.id), awayAbbr: a.athlete?.shortName ?? "", awayRecord: rec(a),
      awayScore: st === "post" ? (a.winner ? "1" : "0") : "",
      venue: c.venue?.fullName ?? ev.venues?.[0]?.fullName, odds: {} as any,
    } as ESPNGame;
  }).filter(Boolean).reverse();
}

/** UFC fighter birth date (YYYY-MM-DD) from ESPN's athlete endpoint. */
export async function fetchFighterDob(id?: string): Promise<string | undefined> {
  if (!id) return undefined;
  try {
    const r = await espnFetch(`https://site.web.api.espn.com/apis/common/v3/sports/mma/athletes/${id}`);
    const d = await r.json(); const m = String(d?.athlete?.displayDOB ?? "").match(/(\d+)\/(\d+)\/(\d{4})/);
    return m ? `${m[3]}-${m[1].padStart(2, "0")}-${m[2].padStart(2, "0")}` : undefined;
  } catch { return undefined; }
}

function mapEvent(ev: ESPNEvent, league: string): ESPNGame | null {
  const comp = ev.competitions?.[0];
  if (!comp) return null;
  const home = comp.competitors.find((c) => c.homeAway === "home");
  const away = comp.competitors.find((c) => c.homeAway === "away");
  if (!home || !away) return null;

  const stateRaw = ev.status?.type?.state ?? "pre";
  const state: "pre" | "in" | "post" =
    stateRaw === "in" ? "in" : stateRaw === "post" ? "post" : "pre";

  const odds = comp.odds?.[0];
  const moneylineHome = odds?.moneyline?.home?.close?.odds ?? (odds?.homeTeamOdds?.moneyLine != null ? String(odds.homeTeamOdds.moneyLine) : "");
  const moneylineAway = odds?.moneyline?.away?.close?.odds ?? (odds?.awayTeamOdds?.moneyLine != null ? String(odds.awayTeamOdds.moneyLine) : "");
  const spreadHome = odds?.pointSpread?.home?.close?.line ?? odds?.details ?? "";
  const spreadAway = odds?.pointSpread?.away?.close?.line ?? "";
  const overUnder = odds?.overUnder != null ? String(odds.overUnder) : "";

  const extractLeaders = (c: ESPNCompetitor): string[] => {
    const names: string[] = [];
    // Probable starters (MLB pitchers, etc.) first
    for (const p of c.probables ?? []) {
      const n = p.athlete?.fullName ?? p.athlete?.displayName;
      if (n && !names.includes(n)) names.push(n);
    }
    // Stat leaders = best of the lineup
    for (const grp of c.leaders ?? []) {
      for (const l of grp.leaders ?? []) {
        const n = l.athlete?.fullName ?? l.athlete?.displayName;
        if (n && !names.includes(n)) names.push(n);
      }
    }
    return names.slice(0, 6);
  };

  return {
    id: ev.id,
    league,
    status: state,
    statusDetail: ev.status?.type?.shortDetail ?? "",
    startTime: ev.date,
    homeTeam: home.team.displayName,
    homeTeamId: home.team.id,
    homeAbbr: home.team.abbreviation,
    homeRecord: home.records?.[0]?.summary ?? "",
    homeScore: home.score ?? "",
    homeLogo: home.team.logo,
    awayTeam: away.team.displayName,
    awayTeamId: away.team.id,
    awayAbbr: away.team.abbreviation,
    awayRecord: away.records?.[0]?.summary ?? "",
    awayScore: away.score ?? "",
    awayLogo: away.team.logo,
    venue: comp.venue?.fullName,
    broadcast: comp.broadcasts?.[0]?.names?.[0],
    odds: {
      spreadHome,
      spreadAway,
      moneylineHome: moneylineHome != null ? String(moneylineHome) : "",
      moneylineAway: moneylineAway != null ? String(moneylineAway) : "",
      overUnder,
      book: odds?.provider?.name || "",
    },
    homeLeaders: extractLeaders(home),
    awayLeaders: extractLeaders(away),
  };
}

const FD_PAGE: Record<string, string> = { NBA: "nba", NFL: "nfl", NHL: "nhl", MLB: "mlb" };

function fdAmerican(runner: { winRunnerOdds?: { americanDisplayOdds?: { americanOdds?: string | number } } } | undefined) {
  const n = runner?.winRunnerOdds?.americanDisplayOdds?.americanOdds;
  return n == null ? "" : String(n);
}

/** Current FanDuel moneyline, spread, and total. Keyed by the two team names, sorted. */
export async function fetchFanDuelBoard(league: string): Promise<Record<string, OddsBlock>> {
  const page = FD_PAGE[league];
  if (!page) return {};
  try {
    const res = await espnFetch(`https://sbapi.nj.sportsbook.fanduel.com/api/content-managed-page?page=CUSTOM&customPageId=${page}&_ak=FhMFpcPWXMeyZxOx`);
    if (!res.ok) return {};
    const data = await res.json() as { attachments?: { markets?: Record<string, { eventId?: number; marketName?: string; runners?: { runnerName?: string; handicap?: number; winRunnerOdds?: { americanDisplayOdds?: { americanOdds?: string | number } } }[] }> } };
    const markets = Object.values(data.attachments?.markets ?? {});
    const byEvent = new Map<string, { ml?: typeof markets[0]; spread?: typeof markets[0]; total?: typeof markets[0] }>();
    for (const m of markets) {
      const id = String(m.eventId ?? "");
      const row = byEvent.get(id) ?? {};
      if (m.marketName === "Moneyline") row.ml = m;
      else if (m.marketName === "Spread" || m.marketName === "Puck Line" || m.marketName === "Run Line") row.spread = m;
      else if (m.marketName === "Total Points" || m.marketName === "Total Goals" || m.marketName === "Total Runs") row.total = m;
      byEvent.set(id, row);
    }
    const out: Record<string, OddsBlock> = {};
    for (const row of byEvent.values()) {
      const runners = row.ml?.runners ?? [];
      if (runners.length < 2 || !runners[0]?.runnerName || !runners[1]?.runnerName) continue;
      const names = [runners[0].runnerName, runners[1].runnerName];
      const line = (name: string, book: typeof row.spread) => {
        const r = (book?.runners ?? []).find((x) => x.runnerName === name);
        if (!r || r.handicap == null) return "";
        const h = r.handicap > 0 ? `+${r.handicap}` : String(r.handicap);
        return h;
      };
      const totalRunner = row.total?.runners?.find((r) => (r.runnerName ?? "").toLowerCase().includes("over")) ?? row.total?.runners?.[0];
      const block: OddsBlock = {
        book: "FanDuel",
        moneylineAway: "",
        moneylineHome: "",
        overUnder: totalRunner?.handicap != null ? String(totalRunner.handicap) : "",
      };
      const key = names.slice().sort().join("|");
      out[key] = block;
      out[runners[0].runnerName] = { ...block, moneylineHome: fdAmerican(runners[0]), spreadHome: line(runners[0].runnerName, row.spread) };
      out[runners[1].runnerName] = { ...block, moneylineHome: fdAmerican(runners[1]), spreadHome: line(runners[1].runnerName, row.spread) };
      out[key] = {
        book: "FanDuel",
        moneylineAway: fdAmerican(runners.find((r) => r.runnerName === names[0])),
        moneylineHome: fdAmerican(runners.find((r) => r.runnerName === names[1])),
        spreadAway: line(names[0], row.spread),
        spreadHome: line(names[1], row.spread),
        overUnder: block.overUnder,
      };
    }
    return out;
  } catch {
    return {};
  }
}

/** Out and doubtful only. Keyed by team display name. */
export async function fetchOuts(league: string): Promise<Record<string, string[]>> {
  const cfg = getLeagueInfo(league);
  if (!cfg.espnPath) return {};
  try {
    const res = await espnFetch(`https://site.api.espn.com/apis/site/v2/sports/${cfg.espnPath}/injuries`);
    if (!res.ok) return {};
    const data = await res.json() as { injuries?: { displayName?: string; team?: { displayName?: string }; injuries?: { status?: string; athlete?: { displayName?: string } }[] }[] };
    const out: Record<string, string[]> = {};
    for (const team of data.injuries ?? []) {
      const name = team.displayName || team.team?.displayName;
      if (!name) continue;
      const rows = (team.injuries ?? []).filter((p) => p.status === "Out" || p.status === "Doubtful").map((p) => p.athlete?.displayName).filter(Boolean) as string[];
      if (rows.length) out[name] = rows;
    }
    return out;
  } catch {
    return {};
  }
}

// ─── Roster fetch ──────────────────────────────────────────────────────────
interface ESPNAthlete {
  id: string;
  fullName?: string;
  displayName?: string;
  jersey?: string;
  position?: { abbreviation?: string };
  dateOfBirth?: string;
  birthDate?: string;
}

export async function fetchTeamRoster(league: string, teamId: string): Promise<ESPNPlayer[]> {
  const cfg = getLeagueInfo(league);
  if (!cfg.espnPath || !teamId) return [];
  const url = `https://site.api.espn.com/apis/site/v2/sports/${cfg.espnPath}/teams/${teamId}/roster`;
  try {
    const res = await espnFetch(url);
    if (!res.ok) return [];
    const data = (await res.json()) as { athletes?: unknown };

    const players: ESPNPlayer[] = [];
    const collect = (arr: unknown) => {
      if (!Array.isArray(arr)) return;
      for (const a of arr as ESPNAthlete[]) {
        if (!a || typeof a !== "object") continue;
        const name = a.fullName ?? a.displayName;
        if (!name) continue;
        players.push({
          id: String(a.id ?? ""),
          fullName: name,
          position: a.position?.abbreviation,
          jersey: a.jersey,
          dob: a.dateOfBirth ?? a.birthDate,
        });
      }
    };

    if (Array.isArray(data.athletes)) {
      for (const grp of data.athletes as Array<ESPNAthlete | { items?: unknown }>) {
        if (grp && typeof grp === "object" && "items" in grp) collect((grp as { items?: unknown }).items);
        else collect([grp]);
      }
    }
    return players;
  } catch {
    return [];
  }
}


// ─── Reweighted team harmony ────────────────────────────────────────────────
// Uses the ShemUniverse compatibility matrix on team-founded lifepath vs the
// game-day lifepath, plus name-number compat, trine match, and self-bonus.
// Returns a 0–100 raw score per side that is then nudged by the lunar bias.

interface TeamScoreCtx {
  isFavorite: boolean;
  isHome: boolean;
  lunarFavorsFavorites: boolean;
  uniYear: number;
  dayCZYear: string;
  dayWestElement: string;
}

function scoreTeam(
  teamName: string,
  dayLifepath: number,
  dayDayEnergy: number,
  ctx: TeamScoreCtx,
): TeamHarmonyResult & { breakdown: string[] } {
  const meta = getTeamMeta(teamName);
  const teamLP = meta ? foundingPath(meta.founded[0], meta.founded[1], meta.founded[2]).reduced : 0;
  const teamNN = nameNumber(teamName).reduced;
  const teamCZ = meta ? czYear(meta.founded[0], meta.founded[1], meta.founded[2]) : "";
  const teamWest = meta ? westernSign(meta.founded[1], meta.founded[2]).element : "";
  const breakdown: string[] = [];

  let score = 35; // baseline

  // 1) Lifepath × day lifepath compatibility — heaviest weight
  if (teamLP) {
    const pts = compatPoints(teamLP, dayLifepath);
    score += pts;
    breakdown.push(`LP ${teamLP}↔${dayLifepath} ${compatTier(teamLP, dayLifepath)} ${pts >= 0 ? "+" : ""}${pts}`);
  }

  // 2) Name # × day energy compatibility — 60% weight of LP
  const npts = Math.round(compatPoints(teamNN, dayDayEnergy) * 0.6);
  score += npts;
  breakdown.push(`Name# ${teamNN}↔${dayDayEnergy} ${compatTier(teamNN, dayDayEnergy)} ${npts >= 0 ? "+" : ""}${npts}`);

  // 3) Universal Year × team LP — global vibration of the calendar year
  if (teamLP) {
    const upts = Math.round(compatPoints(teamLP, ctx.uniYear) * 0.4);
    score += upts;
    breakdown.push(`Univ-Yr ${ctx.uniYear}↔${teamLP} ${compatTier(teamLP, ctx.uniYear)} ${upts >= 0 ? "+" : ""}${upts}`);
  }

  // 4) Trine alignment between team LP and day LP
  if (teamLP && sameTrine(teamLP, dayLifepath)) {
    score += 10;
    breakdown.push("Same trine +10");
  }

  // 5) Chinese zodiac year vs day-year
  if (teamCZ && ctx.dayCZYear) {
    const rel = czRelation(teamCZ, ctx.dayCZYear);
    if (rel === "same")        { score += 8;  breakdown.push(`CZ same (${teamCZ}) +8`); }
    else if (rel === "ally")   { score += 10; breakdown.push(`CZ ally ${teamCZ}↔${ctx.dayCZYear} +10`); }
    else if (rel === "clash")  { score -= 12; breakdown.push(`CZ clash ${teamCZ}↔${ctx.dayCZYear} -12`); }
  }

  // 6) Western element harmony (Fire↔Air, Earth↔Water)
  if (teamWest && ctx.dayWestElement && ELEMENT_FRIENDS[teamWest]?.includes(ctx.dayWestElement)) {
    score += 5; breakdown.push(`Element ${teamWest}↔${ctx.dayWestElement} +5`);
  }

  // 7) Home boost
  if (ctx.isHome) { score += 4; breakdown.push("Home +4"); }

  // 8) Lunar phase nudge — supports favorites OR underdogs per phase
  const lunarSupports = ctx.lunarFavorsFavorites ? ctx.isFavorite : !ctx.isFavorite;
  if (lunarSupports) { score += 12; breakdown.push("Lunar phase +12"); }
  else               { score -= 6;  breakdown.push("Lunar phase -6"); }

  // 9) Mirror compatibility nudge (asymmetric matrix)
  if (teamLP) {
    const mirror = compatPoints(dayLifepath, teamLP);
    if (mirror < 0) score -= 5;
    else if (mirror >= 30) score += 3;
  }

  score = Math.max(5, Math.min(99, score));

  let harmony: TeamHarmonyResult["harmony"];
  if (score >= 82)      harmony = "CHEAT CODE";
  else if (score >= 68) harmony = "STRONG CODE";
  else if (score >= 52) harmony = "LEAN";
  else                  harmony = "FADE";

  return { harmony, score, imprint: teamLP || teamNN, breakdown };
}

export function analyzeGameEnergy(
  game: ESPNGame,
  month: number,
  day: number,
  year: number,
): GameEnergyResult {
  const date = calcDateEnergy(month, day, year);
  const dayLP = lifePath(year, month, day).reduced;
  const dayE = date.reduced;

  // Favorite is determined by moneyline (negative = favorite)
  const homeML = Number(game.odds.moneylineHome);
  const awayML = Number(game.odds.moneylineAway);
  let homeIsFav = true;
  if (Number.isFinite(homeML) && Number.isFinite(awayML)) homeIsFav = homeML <= awayML;
  else if (Number.isFinite(homeML)) homeIsFav = homeML < 0;

  // Lunar bias from current date
  const mp = moonPhase(year, month, day);
  const lunarFavorsFavorites = mp.bias === "FAVORITES";
  const uniYear = universalYear(year);
  const dayCZYear = czYear(year, month, day);
  const dayWestElement = westernSign(month, day).element;

  const ctxBase = { lunarFavorsFavorites, uniYear, dayCZYear, dayWestElement };
  const home = scoreTeam(game.homeTeam, dayLP, dayE, { ...ctxBase, isHome: true, isFavorite: homeIsFav });
  const away = scoreTeam(game.awayTeam, dayLP, dayE, { ...ctxBase, isHome: false, isFavorite: !homeIsFav });

  const predictedWinner: "home" | "away" = home.score >= away.score ? "home" : "away";
  const winner = predictedWinner === "home" ? home : away;
  const winnerTeam = predictedWinner === "home" ? game.homeTeam : game.awayTeam;
  const winnerAbbr = predictedWinner === "home" ? game.homeAbbr : game.awayAbbr;
  const overUnder = game.odds.overUnder || "";

  const moneylineOdds = predictedWinner === "home"
    ? game.odds.moneylineHome
    : game.odds.moneylineAway;
  const mlNum = Number(moneylineOdds);

  const betCard: BetPick = {
    side: `${winnerAbbr || winnerTeam} ML`,
    reason: `${winner.harmony} · ${winner.breakdown.slice(0, 3).join(" · ")}`,
    odds: Number.isFinite(mlNum) && mlNum !== 0 ? mlNum : "—",
  };

  const spreadPick: BetPick = {
    side: `${winnerAbbr || winnerTeam} ${game.odds.spreadHome || "spread"}`,
    reason: `Energy edge ${Math.abs(home.score - away.score)} pts · Lunar: ${mp.bias}`,
    odds: -110,
  };

  const ouNum = Number(overUnder);
  const totalLean = (home.imprint + away.imprint) >= 10 ? "OVER" : "UNDER";
  const totalPickObject: BetPick = {
    side: overUnder ? `${totalLean} ${overUnder}` : "No total posted",
    reason: `Combined imprint ${home.imprint + away.imprint}`,
    odds: Number.isFinite(ouNum) && ouNum !== 0 ? ouNum : "",
  };

  return {
    predictedWinner,
    confidence: winner.score,
    parlayWorthy: winner.harmony === "CHEAT CODE",
    overUnder: overUnder || "—",
    home,
    away,
    dateEnergy: dayE,
    dateDigits: [month, day, year],
    dateCompound: date.compound,
    datePairs: [`${month}+${day}+${year}=${date.fullSum}`, `→ ${dayE}`],
    betCard,
    spreadPick,
    totalPickObject,
  };
}

