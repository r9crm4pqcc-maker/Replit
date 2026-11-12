import { espnFetch } from "./espn";
// Fully automated matchup data retrieval for the gematria decode protocol.
// Pulls starters, managers, birthdays, records and splits straight from ESPN —
// there is no manual entry anywhere in the pipeline.

import { getLeagueInfo } from "./espn";

const SITE = "https://site.api.espn.com/apis/site/v2/sports";
const WEB = "https://site.web.api.espn.com/apis/common/v3/sports";
const CORE = "https://sports.core.api.espn.com/v2/sports";
/** Core API paths need a `leagues` segment: baseball/mlb → baseball/leagues/mlb. */
function corePath(path: string): string {
  const [sport, ...rest] = path.split("/");
  return rest.length ? `${sport}/leagues/${rest.join("/")}` : sport;
}

async function j<T = any>(url: string): Promise<T | null> {
  try {
    const r = await espnFetch(url);
    if (!r.ok) return null;
    return (await r.json()) as T;
  } catch {
    return null;
  }
}

export interface AutoPerson {
  common: string;
  full?: string;
  dob?: string;              // YYYY-MM-DD
  jersey?: string;
  record?: string;           // season W-L
  careerRecord?: string;     // career W-L
  homeRecord?: string;
  roadRecord?: string;
  vsOpponentRecord?: string;
  era?: string;
  whip?: string;
  strikeouts?: string;
  teamRecordInStarts?: string;
}

export interface AutoSide {
  teamId?: string;
  shortName?: string;
  longName?: string;
  record?: string;
  homeRecord?: string;
  roadRecord?: string;
  last10?: string;
  lastPlayed?: string;
  outs?: number;
  streak?: string;
  monthRecord?: string;
  abbr?: string;
  keyJerseys?: number[];
  manager?: AutoPerson;
  starter?: AutoPerson;
}

export interface AutoMatchup {
  retrievedAt: string;
  home: AutoSide;
  away: AutoSide;
  venue?: string;
  venueCity?: string;
  venueState?: string;
  seriesGame?: number;
  seriesRecord?: string;
  seasonSeries?: string;
  allTimeSeries?: string;
  homeSeriesWins?: number;
  awaySeriesWins?: number;
  homeH2hWins?: number;
  awayH2hWins?: number;
  /** Series digits that could not be assigned to one side. */
  sharedSeries?: number[];
  /** Previous meeting scores and margins. */
  priorNumbers?: number[];
  pitchersConfirmed: boolean;
  gaps: string[];
}

const iso = (s?: string) => (s ? s.slice(0, 10) : undefined);

function findRecord(list: any[] | undefined, type: string): string | undefined {
  const r = list?.find((x) => (x.type ?? x.name ?? "").toLowerCase() === type);
  return r?.summary ?? r?.displayValue ?? undefined;
}

/** Season + career pitching lines from the athlete stats endpoint. */
async function pitcherStats(path: string, athleteId: string, season: number) {
  const s = await j<any>(`${WEB}/${path}/athletes/${athleteId}/stats`);
  const cat = s?.categories?.find((c: any) => c.name === "pitching");
  if (!cat) return null;
  const labels: string[] = cat.labels ?? [];
  const idx = (l: string) => labels.indexOf(l);
  const rows: any[] = (cat.statistics ?? []).filter((r: any) => r?.stats?.length);
  const num = (row: any, l: string) => Number(row.stats[idx(l)] ?? 0) || 0;
  let cw = 0, cl = 0;
  for (const r of rows) { cw += num(r, "W"); cl += num(r, "L"); }
  const cur = rows.find((r: any) => String(r?.season?.year ?? r?.season?.displayName ?? "") === String(season)) ?? rows[rows.length - 1];
  return {
    season: cur ? `${num(cur, "W")}-${num(cur, "L")}` : undefined,
    career: rows.length ? `${cw}-${cl}` : undefined,
    era: cur ? String(cur.stats[idx("ERA")] ?? "") : undefined,
    whip: cur ? String(cur.stats[idx("WHIP")] ?? "") : undefined,
    strikeouts: cur ? String(cur.stats[idx("K")] ?? "") : undefined,
  };
}

async function buildStarter(path: string, prob: any, season: number): Promise<AutoPerson | undefined> {
  const ath = prob?.athlete;
  const id = String(prob?.playerId ?? ath?.id ?? "");
  if (!ath?.displayName && !ath?.fullName) return undefined;
  const [core, stats] = await Promise.all([
    id ? j<any>(`${CORE}/${corePath(path)}/athletes/${id}?lang=en&region=us`) : Promise.resolve(null),
    id ? pitcherStats(path, id, season) : Promise.resolve(null),
  ]);
  return {
    common: ath.displayName ?? ath.fullName,
    full: core?.fullName ?? ath.fullName,
    dob: iso(core?.dateOfBirth),
    jersey: ath.jersey,
    record: stats?.season,
    careerRecord: stats?.career,
    era: stats?.era,
    whip: stats?.whip,
    strikeouts: stats?.strikeouts,
  };
}

async function buildManager(path: string, teamId: string, season: number): Promise<AutoPerson | undefined> {
  let list = await j<any>(`${CORE}/${corePath(path)}/seasons/${season}/teams/${teamId}/coaches?lang=en&region=us`);
  if (!list?.items?.length) {
    list = await j<any>(`${CORE}/${corePath(path)}/seasons/${season - 1}/teams/${teamId}/coaches?lang=en&region=us`);
  }
  const ref = list?.items?.[0]?.$ref;
  if (!ref) return undefined;
  const c = await j<any>(ref.replace("http://", "https://"));
  if (!c) return undefined;
  const common = `${(c.firstName ?? "").trim()} ${(c.lastName ?? "").trim()}`.trim();
  if (!common) return undefined;
  let record: string | undefined;
  const rref = c.records?.[0]?.record?.$ref;
  if (rref) {
    const rec = await j<any>(rref.replace("http://", "https://"));
    record = rec?.summary ?? rec?.displayValue;
  }
  return {
    common,
    full: c.person?.fullName ?? common,
    dob: iso(c.dateOfBirth),
    record,
  };
}

/** One call → every participant number the protocol needs, no manual entry. */
function mentions(blob: string, name?: string, abbr?: string): boolean {
  const s = blob.toLowerCase();
  if (abbr && new RegExp(`\\b${abbr.toLowerCase().replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`).test(s)) return true;
  if (!name) return false;
  const parts = name.toLowerCase().split(/\s+/).filter((w) => w.length >= 3);
  return parts.some((w) => s.includes(w));
}

/** "TB wins series 3-2" / "Series tied 1-1" → each side's win count. */
export function splitSeries(summary: string | undefined, homeName?: string, awayName?: string, homeAbbr?: string, awayAbbr?: string): { home?: number; away?: number; shared?: number[] } {
  if (!summary) return {};
  const tied = summary.match(/tied[^0-9]*(\d+)\s*[-–]\s*(\d+)/i);
  if (tied) return { home: +tied[1], away: +tied[2] };
  const lead = summary.match(/^(.*?)\s+(?:wins|leads|lead)\b[^0-9]*(\d+)\s*[-–]\s*(\d+)/i);
  if (lead) {
    const hi = +lead[2];
    const lo = +lead[3];
    const homeHit = mentions(lead[1], homeName, homeAbbr);
    const awayHit = mentions(lead[1], awayName, awayAbbr);
    if (homeHit && !awayHit) return { home: hi, away: lo };
    if (awayHit && !homeHit) return { home: lo, away: hi };
    return { shared: [hi, lo] };
  }
  const bare = summary.match(/(\d+)\s*[-–]\s*(\d+)/);
  return bare ? { shared: [+bare[1], +bare[2]] } : {};
}

function streakLabel(standings: any, teamId: string): string | undefined {
  for (const g of standings?.groups ?? []) {
    for (const e of g?.standings?.entries ?? g?.entries ?? []) {
      const id = String(e?.id ?? e?.team?.id ?? "");
      if (id !== teamId) continue;
      const st = (e?.stats ?? []).find((s: any) => s?.name === "streak" || s?.type === "streak");
      if (st?.displayValue) return String(st.displayValue);
    }
  }
  return undefined;
}

function starterJerseys(box: any, teamId: string, extra?: string): number[] {
  const nums = new Set<number>();
  const add = (v: unknown) => {
    const n = Number(String(v ?? "").replace(/[^\d]/g, ""));
    if (n > 0 && n < 100) nums.add(n);
  };
  add(extra);
  for (const team of box?.players ?? []) {
    const id = String(team?.team?.id ?? "");
    if (teamId && id && id !== teamId) continue;
    for (const stat of team?.statistics ?? []) {
      for (const row of stat?.athletes ?? []) {
        if (row?.starter !== true) continue;
        add(row?.athlete?.jersey ?? row?.jersey);
      }
    }
  }
  return [...nums].slice(0, 6);
}

export async function fetchAutoMatchup(league: string, gameId: string): Promise<AutoMatchup> {
  const cfg = getLeagueInfo(league);
  const path = cfg.espnPath;
  const gaps: string[] = [];
  const out: AutoMatchup = {
    retrievedAt: new Date().toISOString(),
    home: {}, away: {},
    pitchersConfirmed: false,
    gaps,
  };
  if (!path || !gameId) { gaps.push("league feed unavailable"); return out; }

  const s = await j<any>(`${SITE}/${path}/summary?event=${gameId}`);
  if (!s) { gaps.push("ESPN summary unreachable"); return out; }

  const comp = s.header?.competitions?.[0];
  const season = Number(s.header?.season?.year ?? new Date().getFullYear());
  const competitors: any[] = comp?.competitors ?? [];

  out.venue = s.gameInfo?.venue?.fullName;
  out.venueCity = s.gameInfo?.venue?.address?.city;
  out.venueState = s.gameInfo?.venue?.address?.state;

  // Season series / current series / all-time
  const series: any[] = s.seasonseries ?? [];
  const current = series.find((x) => x.type === "current") ?? series[0];
  if (current) {
    out.seriesRecord = current.seriesScore ?? current.summary;
    out.seriesGame = (current.events?.filter((e: any) => e.status === "post").length ?? 0) + 1;
  }
  const seasonSer = series.find((x) => x.type === "season") ?? series.find((x) => /season/i.test(x.title ?? ""));
  out.seasonSeries = seasonSer?.summary ?? current?.summary;

  const sides = await Promise.all(
    competitors.map(async (c: any) => {
      const teamId = String(c.team?.id ?? c.id ?? "");
      const side: AutoSide = {
        teamId,
        abbr: c.team?.abbreviation,
        shortName: c.team?.shortDisplayName ?? c.team?.name ?? c.team?.abbreviation,
        longName: c.team?.displayName ?? c.team?.shortDisplayName,
        record: findRecord(c.record, "total") ?? c.record?.[0]?.summary,
        homeRecord: findRecord(c.record, "home"),
        roadRecord: findRecord(c.record, "road") ?? findRecord(c.record, "away"),
        streak: findRecord(c.record, "streak") ?? findRecord(c.records, "streak"),
      };
      const prob = c.probables?.[0];
      const [starter, manager] = await Promise.all([
        prob ? buildStarter(path, prob, season) : Promise.resolve(undefined),
        teamId ? buildManager(path, teamId, season) : Promise.resolve(undefined),
      ]);
      side.starter = starter;
      side.manager = manager;
      return { homeAway: c.homeAway, side };
    }),
  );

  for (const { homeAway, side } of sides) {
    if (homeAway === "home") out.home = side; else out.away = side;
  }

  const homeStreak = out.home.teamId ? streakLabel(s.standings, out.home.teamId) : undefined;
  const awayStreak = out.away.teamId ? streakLabel(s.standings, out.away.teamId) : undefined;
  if (homeStreak) out.home.streak = homeStreak;
  if (awayStreak) out.away.streak = awayStreak;
  out.home.keyJerseys = starterJerseys(s.boxscore, out.home.teamId ?? "", out.home.starter?.jersey);
  out.away.keyJerseys = starterJerseys(s.boxscore, out.away.teamId ?? "", out.away.starter?.jersey);

  const homeLabel = out.home.longName || out.home.shortName;
  const awayLabel = out.away.longName || out.away.shortName;
  const seasonSplit = splitSeries(seasonSer?.summary ?? seasonSer?.seriesScore, homeLabel, awayLabel, out.home.abbr, out.away.abbr);
  const currentSplit = splitSeries(current?.summary ?? current?.seriesScore, homeLabel, awayLabel, out.home.abbr, out.away.abbr);
  out.homeH2hWins = seasonSplit.home;
  out.awayH2hWins = seasonSplit.away;
  out.homeSeriesWins = currentSplit.home;
  out.awaySeriesWins = currentSplit.away;
  const shared = [...(seasonSplit.shared ?? []), ...(currentSplit.shared ?? [])].filter((n) => n > 0);
  if (shared.length) out.sharedSeries = [...new Set(shared)];

  const priors: number[] = [];
  const seen = new Set<string>();
  for (const block of series) {
    for (const ev of block?.events ?? []) {
      const id = String(ev?.id ?? "");
      if (!id || seen.has(id) || id === String(gameId)) continue;
      const post = ev?.status === "post" || ev?.statusType?.state === "post" || ev?.statusType?.completed === true;
      if (!post) continue;
      seen.add(id);
      const scores = (ev.competitors ?? []).map((c: any) => Number(c?.score)).filter((n: number) => Number.isFinite(n));
      if (scores.length < 2) continue;
      priors.push(scores[0], scores[1], Math.abs(scores[0] - scores[1]));
    }
  }
  out.priorNumbers = [...new Set(priors.filter((n) => n > 0))];

  // last five games → last-10-ish form line
  for (const block of s.lastFiveGames ?? []) {
    const id = String(block.team?.id ?? "");
    const wins = (block.events ?? []).filter((e: any) => /W/.test(e.gameResult ?? "")).length;
    const games = (block.events ?? []).length;
    if (!games) continue;
    const line = `${wins}-${games - wins}`;
    if (out.home.teamId === id) out.home.last10 = line;
    if (out.away.teamId === id) out.away.last10 = line;
    const dates = (block.events ?? []).map((e: any) => String(e?.gameDate ?? e?.date ?? "").slice(0, 10)).filter((d: string) => /^\d{4}-\d{2}-\d{2}$/.test(d));
    const last = dates.sort().at(-1);
    if (last && out.home.teamId === id) out.home.lastPlayed = last;
    if (last && out.away.teamId === id) out.away.lastPlayed = last;
  }
  if (Array.isArray(s.injuries)) {
    const outs = (id?: string) => {
      let n = 0;
      for (const block of s.injuries) {
        if (id && String(block?.team?.id ?? "") !== id) continue;
        for (const inj of block?.injuries ?? []) {
          const st = `${inj?.status ?? ""} ${inj?.type?.description ?? ""}`.toLowerCase();
          if (/\bout\b/.test(st)) n++;
        }
      }
      return n;
    };
    if (out.home.teamId) out.home.outs = outs(out.home.teamId);
    if (out.away.teamId) out.away.outs = outs(out.away.teamId);
  }

  out.pitchersConfirmed = !!(out.home.starter && out.away.starter);
  if (!out.home.starter || !out.away.starter) gaps.push("starters not yet posted by the league");
  if (!out.home.manager || !out.away.manager) gaps.push("head coach/manager feed unavailable for this league");
  if (!out.home.starter?.careerRecord && !out.away.starter?.careerRecord) gaps.push("career pitching lines unavailable");
  return out;
}
