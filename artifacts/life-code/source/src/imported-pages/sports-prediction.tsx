// @ts-nocheck
import { useState, useMemo, useEffect, useCallback, useRef } from "react";
import { ChevronDown, ChevronUp, RefreshCw, Loader2, AlertCircle, Calendar } from "lucide-react";
import { fetchESPNGames, fetchFanDuelBoard, fetchOuts, getLeagueInfo, fetchFighterDob, type ESPNGame, type OddsBlock } from "@/lib/espn";
import { getTeamMeta } from "@/lib/sports-data";
import { fetchAutoMatchup, type AutoMatchup } from "@/lib/espn-auto";
import { layerWeights, logStepPick, savedHistory, scoreStepPick, setSportsMode, sportsMode, stepHitRates, type SportsMode } from "@/lib/sports-learning";
import { calcAthletePersonalDay } from "@/lib/numerology";
import { runVotes, TEAM_COLORS, fmt, colorNumsLabel, confidenceBand, type VoteResult } from "@/lib/vote-decode";
import { FullDecode, computeFullDecode, parseDob, type DecodeEntity } from "@/components/FullDecode";
import type { Tri } from "@/lib/full-decode";
import { useOverrides } from "@/lib/date-overrides";
import { buildMatchBrief, type MatchBrief, type Tone, type BriefEntity } from "@/lib/sports-brief";
import { cipherLine, gematriaDecode, type GematriaDecode, type GematriaSideRead } from "@/lib/sports-gematria";

const cap = (n: number) => Math.max(0, Math.min(100, Math.round(n)));
/** How often the better record won. Used only to allow a best pick, not to change the card percent or the pick. */
const RECORD_GAP_HIT: Record<number, number> = { 50: 97.2, 40: 87.8, 30: 82.3, 15: 68.5 };
function gapHit(votes: { side: string; reason: string }[], pick: "home" | "away") {
  const gap = votes.find((x) => /Better record gap (50|40|30|15)/.test(x.reason));
  const band = Number(gap?.reason.match(/Better record gap (\d+)/)?.[1]);
  const rate = RECORD_GAP_HIT[band];
  if (!gap || !rate || gap.side !== pick) return null;
  return rate;
}
function learnedPct(votes: { side: string; weight: number; reason: string }[], pick: "home" | "away") {
  const row = votes.find((x) => x.weight > 0 && /points clear/.test(x.reason));
  const pts = Number(row?.reason.match(/(\d+) points clear/)?.[1]);
  if (!row || !Number.isFinite(pts)) return null;
  const chance = 100 / (1 + 10 ** (-pts / 400));
  return cap(row.side === pick ? chance : 100 - chance);
}
function splitPct(home: number, away: number) {
  const h = Math.max(0, home), a = Math.max(0, away);
  const homePct = cap((100 * h) / (h + a || 1));
  return { homePct, awayPct: 100 - homePct };
}
const YELLOW = "#FF6A00";
const BLUE = "#60A5FA";
const GREEN = "#4ade80";
const ROSE = "#f472b6";
const PURPLE = "#a78bfa";

const LEAGUE_GROUPS = [
  { label: "FIFA World Cup 2026", leagues: ["World Cup"] },
  { label: "US Major", leagues: ["NBA", "NFL", "MLB", "NHL", "UFC"] },
  { label: "Soccer", leagues: ["MLS", "Premier League", "La Liga", "Bundesliga", "Serie A", "Ligue 1"] },
  { label: "European Cups", leagues: ["UCL", "UEL", "UECL"] },
  { label: "More", leagues: ["Liga MX", "WNBA", "College Football", "College Basketball"] },
];

const TONE_COLOR: Record<Tone, string> = {
  friend: "#4ade80",
  enemy: "#f87171",
  master: "#FF6A00",
  neutral: "rgba(255,255,255,0.55)",
  info: "rgba(255,255,255,0.78)",
};

function kickLabel(iso?: string) {
  const t = new Date(iso || "");
  if (Number.isNaN(t.getTime())) return "";
  return t.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", timeZone: "America/New_York" }) + " EST";
}

function Fold({ title, children, startOpen = false }: { title: string; children: React.ReactNode; startOpen?: boolean }) {
  const [open, setOpen] = useState(startOpen);
  return (
    <div className="rounded-xl overflow-hidden" style={{ border: "1px solid rgba(255,255,255,0.08)" }}>
      <button type="button" onClick={() => setOpen((v) => !v)} className="w-full flex items-center justify-between px-3 py-2.5 text-left" style={{ background: "rgba(255,255,255,0.03)" }}>
        <span className="text-[11px] font-bold tracking-[0.14em] text-white">{title}</span>
        {open ? <ChevronUp size={14} className="text-white/40" /> : <ChevronDown size={14} className="text-white/40" />}
      </button>
      {open && <div className="p-3 border-t border-white/5">{children}</div>}
    </div>
  );
}

function BriefChunk({ brief, titles }: { brief: MatchBrief; titles: string[] }) {
  const want = new Set(titles.map((t) => t.toLowerCase()));
  const sections = [...brief.sections, ...brief.upgrades].filter((s) => want.has(s.title.toLowerCase()));
  if (!sections.length) return <p className="text-[11px] text-white/40">Nothing on this layer for this game.</p>;
  return (
    <div className="space-y-3">
      {sections.map((section) => (
        <div key={section.title}>
          <p className="text-[10px] font-bold tracking-[0.12em] mb-1" style={{ color: YELLOW }}>{section.title.toUpperCase()}</p>
          <ul className="space-y-0.5">
            {section.lines.map((line, i) => (
              <li key={i} className="text-[11px]" style={{ color: TONE_COLOR[line.tone] }}>• {line.text}</li>
            ))}
          </ul>
        </div>
      ))}
    </div>
  );
}

type BoardRow = { id: string; matchup: string; pick: string; pct: number; allow: number | null; open: boolean; venue: string; time: string; record: string };

function StatusBadge({ status, detail }: { status: string; detail: string }) {
  if (status === "in") return <span className="inline-flex items-center gap-1 text-[9px] font-bold px-2 py-0.5 rounded-full" style={{ background: "rgba(239,68,68,0.15)", color: "#ef4444" }}>LIVE</span>;
  if (status === "post") return <span className="text-[9px] font-bold px-2 py-0.5 rounded-full" style={{ background: "rgba(74,222,128,0.12)", color: GREEN }}>FINAL</span>;
  return <span className="text-[9px] font-medium px-2 py-0.5 rounded-full" style={{ background: "rgba(255,255,255,0.06)", color: "rgba(255,255,255,0.55)" }}>{detail || "Scheduled"}</span>;
}

function Pill({ children, tone = "muted" }: { children: React.ReactNode; tone?: "muted" | "primary" | "danger" }) {
  const cls = tone === "primary" ? "bg-primary/15 text-primary border-primary/30" : tone === "danger" ? "bg-destructive/15 text-destructive border-destructive/40" : "bg-muted text-muted-foreground border-border";
  return <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-semibold ${cls}`}>{children}</span>;
}

function GematriaSideBlock({ read }: { read: GematriaSideRead }) {
  return (
    <div className="rounded-lg border border-border bg-muted/30 p-3">
      <p className="text-sm font-black text-foreground mb-1">{read.team}</p>
      <ul className="space-y-1 mb-2">
        {read.names.map((row) => (
          <li key={`${row.role}-${row.name}`} className="text-[11px] text-foreground">
            <span className="text-muted-foreground">{row.role} · {row.name}</span>
            <br />
            <span className="font-semibold">{cipherLine(row.ciphers)}</span>
          </li>
        ))}
      </ul>
      <p className="text-[11px] text-foreground"><span className="font-bold">Hits:</span> {read.hits.length ? read.hits.join("; ") : "none"}</p>
      <p className="text-[11px] text-foreground"><span className="font-bold">Score:</span> {read.score >= 0 ? `+${read.score}` : read.score}</p>
      <p className="text-[10px] text-muted-foreground">{read.parts}</p>
    </div>
  );
}

function GematriaBlock({ data }: { data: GematriaDecode }) {
  return (
    <div className="space-y-2">
      <p className="text-[10px] font-bold tracking-[0.16em]" style={{ color: PURPLE }}>{data.title.toUpperCase()}</p>
      <p className="text-[10px] text-muted-foreground">{data.dateLabel}. Four ciphers on every name. This layer does not change the pick above.</p>
      <div className="grid md:grid-cols-2 gap-2">
        <GematriaSideBlock read={data.away} />
        <GematriaSideBlock read={data.home} />
      </div>
      <p className="text-[12px] font-bold text-foreground">Clash: {data.clash ? "Yes" : "No"}{data.clash ? ` — ${data.clashNote.replace(/^Yes — /, "")}` : ""}</p>
      <p className="text-[10px] text-muted-foreground">Clash compares full Ordinal and Reverse totals. A shared single-digit reduction is not a clash.</p>
      <p className="text-[12px] font-bold" style={{ color: data.ignored ? "rgba(255,255,255,0.55)" : PURPLE }}>Net Gematria Edge: {data.edge}</p>
      <p className="text-[11px] text-foreground">{data.decision}</p>
    </div>
  );
}

function wl(record?: string | null) {
  const m = record?.match(/(\d+)\s*[-–]\s*(\d+)/);
  return m ? { wins: +m[1], losses: +m[2] } : {};
}
function streakParts(s?: string) {
  const m = s?.match(/([WL])\s*(\d+)/i);
  if (!m) return {};
  const n = +m[2];
  if (!n) return {};
  return m[1].toUpperCase() === "L" ? { loseStreak: n } : { winStreak: n };
}

function slateLeg(game: ESPNGame, year: number, month: number, day: number, league: string, ov: ReturnType<typeof useOverrides>, learned = false) {
  const homeMeta = getTeamMeta(game.homeTeam);
  const awayMeta = getTeamMeta(game.awayTeam);
  const t = new Date(game.startTime);
  const kickoff = Number.isNaN(t.getTime()) ? 19 : t.getHours();
  const side = (name: string, meta: ReturnType<typeof getTeamMeta>, rec?: string | null) => ({
    name,
    founded: meta?.founded ? [meta.founded[0], meta.founded[1], meta.founded[2]] as [number, number, number] : undefined,
    colors: TEAM_COLORS[name],
    record: rec ?? undefined,
    people: [],
  });
  const v = runVotes({
    year, month, day, league, hour: kickoff,
    home: side(game.homeTeam, homeMeta, game.homeRecord),
    away: side(game.awayTeam, awayMeta, game.awayRecord),
    stadiumOpened: homeMeta?.stadiumOpened, cityFounded: homeMeta?.cityFounded,
    stadium: homeMeta?.stadium, city: homeMeta?.city,
  });
  const tri = (d?: readonly number[]) => (d ? [d[0], d[1], d[2]] as Tri : undefined);
  const full = computeFullDecode([
    { kind: "team", side: "away", name: game.awayTeam, date: tri(awayMeta?.founded), record: game.awayRecord },
    { kind: "team", side: "home", name: game.homeTeam, date: tri(homeMeta?.founded), record: game.homeRecord },
    { kind: "city", side: "venue", name: homeMeta?.city ?? "Host city", date: tri(homeMeta?.cityFounded) },
    { kind: "stadium", side: "venue", name: game.venue ?? homeMeta?.stadium ?? "Stadium", date: tri(homeMeta?.stadiumOpened) },
  ], [year, month, day], kickoff, ov);
  const rawHome = v.home + full.home, rawAway = v.away + full.away;
  const totalHome = learned ? v.home : rawHome, totalAway = learned ? v.away : rawAway;
  const finalPick: "home" | "away" = totalHome === totalAway ? v.pick : totalHome > totalAway ? "home" : "away";
  const pile = totalHome + totalAway || 1;
  const split = splitPct(totalHome, totalAway);
  const pct = learned ? (learnedPct(v.votes, finalPick) ?? (finalPick === "home" ? split.homePct : split.awayPct)) : (finalPick === "home" ? split.homePct : split.awayPct);
  const allow = gapHit(v.votes, finalPick);
  const hs = Number(game.homeScore), as = Number(game.awayScore);
  const scored = game.status === "post" && Number.isFinite(hs) && Number.isFinite(as);
  const result: "hit" | "miss" | "push" | "open" = !scored ? "open" : hs === as ? "push" : (hs > as ? "home" : "away") === finalPick ? "hit" : "miss";
  return {
    id: `${league}-${game.id}`,
    league,
    pick: finalPick === "home" ? game.homeTeam : game.awayTeam,
    pct,
    allow,
    result,
    open: game.status !== "post",
    matchup: `${game.awayTeam} vs ${game.homeTeam}`,
  };
}

function implied(ml?: string) {
  const n = Number(String(ml ?? "").replace("+", ""));
  if (!Number.isFinite(n) || n === 0) return null;
  return n < 0 ? -n / (-n + 100) : 100 / (n + 100);
}
function fanDuelFor(board: Record<string, OddsBlock>, away: string, home: string): OddsBlock | null {
  const a = board[away];
  const h = board[home];
  if (!a && !h) return null;
  return {
    book: "FanDuel",
    moneylineAway: a?.moneylineHome || "",
    moneylineHome: h?.moneylineHome || "",
    spreadAway: a?.spreadHome || "",
    spreadHome: h?.spreadHome || "",
    overUnder: a?.overUnder || h?.overUnder || "",
  };
}
function playCall(pct: number, side: "home" | "away", odds: OddsBlock) {
  const ml = side === "home" ? odds.moneylineHome : odds.moneylineAway;
  const price = implied(ml);
  if (price == null) return "";
  const edge = pct / 100 - price;
  if (edge >= 0.04) return "Moneyline";
  if (edge >= 0) return "Spread";
  return "Pass";
}
function isBest(pct: number, allow: number | null) {
  return pct >= 75 || (allow != null && allow >= 75);
}
function bestLegs(legs: { pct: number; allow: number | null; open: boolean }[]) {
  const open = legs.filter((l) => l.open).sort((a, b) => (b.allow ?? b.pct) - (a.allow ?? a.pct));
  const hot = open.filter((l) => isBest(l.pct, l.allow));
  return (hot.length >= 2 ? hot : open).slice(0, 4);
}

function GameCard({ game, year, month, day, idx, league, learned, onReady, prices, outs }: { game: ESPNGame; year: number; month: number; day: number; idx: number; league: string; learned: boolean; onReady?: (row: BoardRow) => void; prices: Record<string, OddsBlock>; outs: Record<string, string[]> }) {
  const [auto, setAuto] = useState<AutoMatchup | null>(null);
  const [autoLoading, setAutoLoading] = useState(true);
  const [openDecode, setOpenDecode] = useState(false);
  const isFight = league === "UFC";
  const [dobs, setDobs] = useState<{ home?: string; away?: string }>({});
  useEffect(() => {
    if (!isFight) return;
    let alive = true;
    Promise.all([fetchFighterDob(game.homeTeamId), fetchFighterDob(game.awayTeamId)]).then(([h, a]) => { if (alive) { setDobs({ home: h, away: a }); setAutoLoading(false); } });
    return () => { alive = false; };
  }, [game.id, isFight]);
  useEffect(() => {
    if (isFight) return;
    let alive = true;
    setAutoLoading(true);
    fetchAutoMatchup(league, game.id)
      .then(a => { if (alive) { setAuto(a); setAutoLoading(false); } })
      .catch(() => { if (alive) setAutoLoading(false); });
    return () => { alive = false; };
  }, [game.id, league]);

  const homeMeta = getTeamMeta(game.homeTeam);
  const awayMeta = getTeamMeta(game.awayTeam);
  const starterRole = league === "NFL" || league === "College Football" ? "quarterback" : league === "MLB" ? "pitcher" : "player";
  const kickoff = useMemo(() => { const t = new Date(game.startTime); return isNaN(t.getTime()) ? 19 : t.getHours(); }, [game.startTime]);
  const v = useMemo(() => {
    const person = (p: any, role: any) => p?.common ? [{ name: p.common, role, dob: p.dob, jersey: p.jersey }] : [];
    const daysSince = (iso?: string) => {
      if (!iso) return undefined;
      const [y, m, d] = iso.split("-").map(Number);
      if (!y || !m || !d) return undefined;
      const diff = Math.round((Date.UTC(year, month - 1, day) - Date.UTC(y, m - 1, d)) / 86400000);
      return diff >= 0 && diff < 40 ? diff : undefined;
    };
    const team = (name: string, meta: any, side: any, rec?: string | null, h2h?: number) => ({
      name, founded: meta?.founded ? [meta.founded[0], meta.founded[1], meta.founded[2]] as [number, number, number] : undefined,
      colors: TEAM_COLORS[name], record: side?.record ?? rec ?? undefined,
      form: side?.last10, splitHome: side?.homeRecord, splitRoad: side?.roadRecord,
      rest: daysSince(side?.lastPlayed), outs: side?.outs, h2hWins: h2h,
      people: [...person(side?.starter, starterRole), ...person(side?.manager, "coach")],
    });
    if (isFight) {
      const dt = (d?: string) => { const m = d?.match(/^(\d{4})-(\d{2})-(\d{2})/); return m ? [+m[1], +m[2], +m[3]] as [number, number, number] : undefined; };
      return runVotes({ year, month, day, league, individual: true, hour: kickoff,
        home: { name: game.homeTeam, founded: dt(dobs.home), record: game.homeRecord, people: [] },
        away: { name: game.awayTeam, founded: dt(dobs.away), record: game.awayRecord, people: [] } });
    }
    return runVotes({
      year, month, day, league, hour: kickoff,
      home: team(game.homeTeam, homeMeta, auto?.home, game.homeRecord, auto?.homeH2hWins),
      away: team(game.awayTeam, awayMeta, auto?.away, game.awayRecord, auto?.awayH2hWins),
      stadiumOpened: homeMeta?.stadiumOpened, cityFounded: homeMeta?.cityFounded,
      stadium: homeMeta?.stadium, city: homeMeta?.city,
    });
  }, [game.id, year, month, day, auto, league, dobs, kickoff]);
  const ov = useOverrides();
  const full = useMemo(() => {
    const tri = (t?: readonly number[]) => (t ? [t[0], t[1], t[2]] as Tri : undefined);
    const rec = (s?: AutoMatchup["home"], base?: string | null) => [s?.record ?? base, s?.streak && `Streak ${s.streak}`, s?.homeRecord && `Home ${s.homeRecord}`, s?.roadRecord && `Away ${s.roadRecord}`].filter(Boolean).join(" · ") || undefined;
    const ents: DecodeEntity[] = isFight ? [
      { kind: "player", side: "away", name: game.awayTeam, role: "fighter", date: parseDob(dobs.away), record: game.awayRecord },
      { kind: "player", side: "home", name: game.homeTeam, role: "fighter", date: parseDob(dobs.home), record: game.homeRecord },
    ] : [
      { kind: "team", side: "away", name: game.awayTeam, date: tri(awayMeta?.founded), record: rec(auto?.away, game.awayRecord) },
      { kind: "team", side: "home", name: game.homeTeam, date: tri(homeMeta?.founded), record: rec(auto?.home, game.homeRecord) },
      ...(["away", "home"] as const).flatMap(s => {
        const a = auto?.[s]; const out: DecodeEntity[] = [];
        out.push(a?.starter ? { kind: "player", side: s, name: a.starter.common, role: starterRole, date: parseDob(a.starter.dob), jersey: a.starter.jersey } : { kind: "player", side: s, name: `${s === "home" ? game.homeTeam : game.awayTeam} starter`, role: "not posted yet" });
        out.push(a?.manager ? { kind: "player", side: s, name: a.manager.common, role: "coach", date: parseDob(a.manager.dob), jersey: a.manager.jersey } : { kind: "player", side: s, name: `${s === "home" ? game.homeTeam : game.awayTeam} coach`, role: "not in feed" });
        return out;
      }),
      { kind: "city", side: "venue", name: homeMeta?.city ?? "Host city", date: tri(homeMeta?.cityFounded) },
      { kind: "stadium", side: "venue", name: game.venue ?? homeMeta?.stadium ?? "Stadium", date: tri(homeMeta?.stadiumOpened) },
    ];
    return computeFullDecode(ents, [year, month, day], kickoff, ov);
  }, [game.id, year, month, day, auto, dobs, kickoff, isFight, ov]);

  const rawHome = v.home + full.home, rawAway = v.away + full.away;
  const totalHome = learned ? v.home : rawHome, totalAway = learned ? v.away : rawAway;
  const finalPick: "home" | "away" = totalHome === totalAway ? v.pick : totalHome > totalAway ? "home" : "away";
  const pickName = finalPick === "home" ? game.homeTeam : game.awayTeam;
  const brief = useMemo(() => {
    const signOf = (name: string) => v.entities.find((e) => e.name === name)?.yearSign;
    const mapped: BriefEntity[] = full.reads.map((x) => ({
      side: x.e.side, kind: x.e.kind, name: x.e.name, role: x.e.role, jersey: x.e.jersey, date: x.e.date,
      yearSign: signOf(x.e.name), lp: x.r?.lp, pd: x.r?.pd, lucky: x.r?.lucky, matrix: x.r?.matrix,
    }));
    return buildMatchBrief(v, mapped, { home: game.homeTeam, away: game.awayTeam, month });
  }, [v, full, game.homeTeam, game.awayTeam, month]);
  const gem = useMemo(() => {
    const people = (a: AutoMatchup["home"] | undefined, leaders?: string[]) => {
      const rows: { role: string; name: string }[] = [];
      const push = (role: string, name?: string) => { if (name) rows.push({ role, name }); };
      push(starterRole, a?.starter?.full || a?.starter?.common);
      push("Coach", a?.manager?.full || a?.manager?.common);
      for (const name of leaders ?? []) push("Player", name);
      return rows;
    };
    const jerseys = (a?: AutoMatchup["home"]) => {
      const nums = [...(a?.keyJerseys ?? [])];
      const j = Number(String(a?.starter?.jersey ?? "").replace(/[^\d]/g, ""));
      if (j > 0) nums.push(j);
      return [...new Set(nums)];
    };
    const side = (name: string, record: string | null | undefined, a: AutoMatchup["home"] | undefined, leaders: string[] | undefined, seriesWins?: number, h2hWins?: number, venue?: { role: string; name: string }[]) => {
      const rec = wl(a?.record ?? record);
      return { team: name, people: people(a, leaders), venue, ...streakParts(a?.streak), seriesWins, h2hWins, seasonWins: rec.wins, seasonLosses: rec.losses, jerseys: jerseys(a) };
    };
    return gematriaDecode({
      awayName: game.awayTeam, homeName: game.homeTeam, month, day, priorNumbers: auto?.priorNumbers, sharedSeries: auto?.sharedSeries,
      away: side(game.awayTeam, game.awayRecord, auto?.away, game.awayLeaders, auto?.awaySeriesWins, auto?.awayH2hWins),
      home: side(game.homeTeam, game.homeRecord, auto?.home, game.homeLeaders, auto?.homeSeriesWins, auto?.homeH2hWins, [
        { role: "City", name: auto?.venueCity || homeMeta?.city || "" },
        { role: "Stadium", name: game.venue || auto?.venue || homeMeta?.stadium || "" },
      ].filter((x) => x.name)),
    });
  }, [game, auto, month, day, homeMeta, starterRole]);
  const stackGap = Math.abs(totalHome - totalAway);
  const split = splitPct(totalHome, totalAway);
  const homePct = split.homePct;
  const awayPct = split.awayPct;
  const pickPct = cap(learned ? (learnedPct(v.votes, finalPick) ?? (finalPick === "home" ? homePct : awayPct)) : (finalPick === "home" ? homePct : awayPct));
  const allow = gapHit(v.votes, finalPick);
  const verdict = `PICK ${pickName}. ${game.awayTeam} ${awayPct}% · ${game.homeTeam} ${homePct}%.`;
  const isFinal = game.status === "post";
  const logId = `${year}-${month}-${day}|${game.id}`;
  const venueName = game.venue ?? homeMeta?.stadium ?? "Venue";
  const when = kickLabel(game.startTime);

  useEffect(() => {
    if (autoLoading) return;
    logStepPick({ id: logId, date: `${year}-${month}-${day}`, home: game.homeTeam, away: game.awayTeam, pick: finalPick, confidence: v.confidence, margin: stackGap, votes: v.votes.map(x => ({ side: x.side, layer: x.layer, weight: x.weight })) });
    if (isFinal) {
      const h = Number(game.homeScore), a = Number(game.awayScore);
      scoreStepPick(logId, h > a ? "home" : a > h ? "away" : "draw");
    }
  }, [autoLoading, isFinal, logId, v]);

  useEffect(() => {
    onReady?.({
      id: game.id,
      matchup: `${game.awayTeam} vs ${game.homeTeam}`,
      pick: pickName,
      pct: pickPct,
      allow,
      open: game.status !== "post",
      venue: venueName,
      time: when,
      record: `${game.awayAbbr} ${game.awayRecord || "—"} · ${game.homeAbbr} ${game.homeRecord || "—"}`,
    });
  }, [game.id, pickName, pickPct, allow, game.status, venueName, when]);

  const result = isFinal ? `${game.awayAbbr} ${game.awayScore} – ${game.homeScore} ${game.homeAbbr}` : null;
  const hit = isFinal ? ((Number(game.homeScore) > Number(game.awayScore) ? "home" : "away") === finalPick) : null;
  const qualified = isBest(pickPct, allow);
  const fd = fanDuelFor(prices, game.awayTeam, game.homeTeam);
  const book = fd?.moneylineHome || fd?.moneylineAway ? fd : (game.odds.moneylineHome || game.odds.moneylineAway ? game.odds : null);
  const call = book ? playCall(pickPct, finalPick, book) : "";
  const awayOut = outs[game.awayTeam] ?? [];
  const homeOut = outs[game.homeTeam] ?? [];
  const starter = league === "NHL" || league === "MLB"
    ? `${game.awayAbbr} ${game.awayLeaders?.[0] || "goalie not posted"} · ${game.homeAbbr} ${game.homeLeaders?.[0] || "goalie not posted"}`
    : "";

  return (
    <div className="rounded-2xl overflow-hidden" style={{ background: "#000", border: qualified ? "1px solid #FF6A00" : "1px solid rgba(255,106,0,0.28)" }}>
      <div className="p-4">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-[15px] font-black text-white leading-tight">{game.awayTeam} <span className="font-medium text-white/35">vs</span> {game.homeTeam}</p>
            <p className="text-[11px] mt-1 text-white/45">{venueName}{when ? ` · ${when}` : ""}</p>
          </div>
          <div className="text-right shrink-0">
            <p className="text-3xl font-black leading-none" style={{ color: YELLOW }}>{pickPct}%</p>
            <p className="text-[9px] mt-1 tracking-widest text-white/35">{confidenceBand(Math.round(pickPct)).toUpperCase()}</p>
          </div>
        </div>
        <div className="mt-3 flex items-end justify-between gap-3">
          <div>
            <p className="text-[9px] uppercase tracking-[0.16em] text-white/35">Record</p>
            <p className="text-[12px] text-white/80 mt-0.5">{game.awayAbbr} {game.awayRecord || "—"}</p>
            <p className="text-[12px] text-white/80">{game.homeAbbr} {game.homeRecord || "—"}</p>
          </div>
          <div className="text-right">
            <p className="text-[9px] uppercase tracking-[0.16em] text-white/35">Pick</p>
            <p className="text-[13px] font-black" style={{ color: YELLOW }}>{pickName}</p>
            {result ? <p className="text-[10px] mt-1" style={{ color: hit ? YELLOW : ROSE }}>{result} · {hit ? "HIT" : "MISS"}</p> : <StatusBadge status={game.status} detail={game.statusDetail} />}
          </div>
        </div>
        {(book || awayOut.length || homeOut.length || starter) && (
          <div className="mt-3 text-[11px] text-white/70 space-y-0.5">
            {book && <p>{book.book || "Line"} {game.awayAbbr} {book.moneylineAway || "—"} {book.spreadAway || ""} · {game.homeAbbr} {book.moneylineHome || "—"} {book.spreadHome || ""}{book.overUnder ? ` · ${book.overUnder}` : ""}{call ? ` · ${call}` : ""}</p>}
            {starter && <p>{league === "NHL" ? "Goalie" : "Pitcher"} {starter}</p>}
            {(awayOut.length || homeOut.length) && <p>Out {game.awayAbbr}: {awayOut.join(", ") || "none"} · {game.homeAbbr}: {homeOut.join(", ") || "none"}</p>}
          </div>
        )}
        <button type="button" onClick={() => setOpenDecode((v) => !v)} className="mt-3 w-full rounded-lg py-2 text-[11px] font-bold tracking-[0.12em]" style={{ background: "rgba(255,255,255,0.04)", color: "rgba(255,255,255,0.75)", border: "1px solid rgba(255,255,255,0.08)" }}>
          {openDecode ? "HIDE FULL DECODE" : "SHOW FULL DECODE"}
        </button>
        {openDecode && (
          <div className="mt-3 space-y-2">
            <Fold title="Verdict" startOpen>
              <p className="text-xs font-bold text-white mb-2">{verdict}</p>
              <p className="text-[11px] text-white/70">{finalPick === "away" ? "PICK" : "OTHER"} {game.awayTeam} {awayPct}%</p>
              <p className="text-[11px] text-white/70 mb-2">{finalPick === "home" ? "PICK" : "OTHER"} {game.homeTeam} {homePct}%</p>
              {v.alerts.map((a, i) => <p key={i} className="text-xs font-bold text-destructive">⚠ {a}</p>)}
              <ul className="mt-2 space-y-1">
                {brief.doing.map((row) => (
                  <li key={row.label} className="text-[11px] text-white/75">
                    <span className="font-bold" style={{ color: row.edge === "Even" ? "rgba(255,255,255,0.4)" : YELLOW }}>{row.label} → {row.edge}.</span> {row.reason}
                  </li>
                ))}
              </ul>
              {isFinal && hit === false && (
                <div className="mt-2">
                  <p className="text-[11px] font-bold" style={{ color: ROSE }}>Factors on the side that lost</p>
                  {v.votes.filter((x) => x.side !== finalPick).map((f, i) => <p key={i} className="text-[11px] text-white/70">{f.layer}: {f.reason}</p>)}
                </div>
              )}
            </Fold>
            <Fold title="Records"><BriefChunk brief={brief} titles={["Record vibration"]} /></Fold>
            <Fold title="Chinese Zodiac"><BriefChunk brief={brief} titles={["Chinese animal friend / enemy"]} /></Fold>
            <Fold title="Number Compatibility"><BriefChunk brief={brief} titles={["Number compatibility chart", "Stacking breakdown", "Jersey number resonance", "Pitcher vs pitcher (or key player)", "Master number highlights", "Extreme resonance", "Master multiplier"]} /></Fold>
            <Fold title="Stars & Venue"><BriefChunk brief={brief} titles={["Venue and city for each side", "Colorology", "Hour cycle", "Stadium founding vs each team", "Your chart on this date", "Wealth day", "Your cycle and the window"]} /></Fold>
            <Fold title="Gematria"><GematriaBlock data={gem} /></Fold>
            <Fold title="Full 5-Part Decode">
              <FullDecode title={`${game.awayTeam} @ ${game.homeTeam} · ${month}/${day}/${year}`} data={full} homeName={game.homeTeam} awayName={game.awayTeam} verdict={verdict} />
              <div className="overflow-x-auto mt-3 rounded-lg border border-border">
                <table className="w-full text-[11px]">
                  <thead className="bg-muted/40 text-muted-foreground">
                    <tr>{["Side", "Role", "Name", "Date", "Life Path", "Day #", "Day energy", "Lucky", "Year / Month / Day animal", "Personal Day"].map(h => <th key={h} className="text-left font-semibold px-2 py-1.5 whitespace-nowrap">{h}</th>)}</tr>
                  </thead>
                  <tbody>
                    {v.entities.map((e, i) => (
                      <tr key={i} className="border-t border-border">
                        <td className="px-2 py-1.5 whitespace-nowrap">{e.side === "venue" ? "Venue" : e.side === "home" ? game.homeTeam : game.awayTeam}</td>
                        <td className="px-2 py-1.5">{e.role}</td>
                        <td className="px-2 py-1.5 font-semibold text-foreground whitespace-nowrap">{e.name}</td>
                        {e.date ? <>
                          <td className="px-2 py-1.5 whitespace-nowrap">{e.date}</td>
                          <td className="px-2 py-1.5">{e.lp && fmt(e.lp)}</td>
                          <td className="px-2 py-1.5">{e.dayOfYear}</td>
                          <td className="px-2 py-1.5">{e.dayEnergy && fmt(e.dayEnergy)}</td>
                          <td className="px-2 py-1.5">{e.lucky}</td>
                          <td className="px-2 py-1.5 whitespace-nowrap">{e.yearSign} / {e.monthSign} / {e.daySign}</td>
                          <td className="px-2 py-1.5 whitespace-nowrap">{e.pd && fmt(e.pd)} ({e.pdRel})</td>
                        </> : <td colSpan={7} className="px-2 py-1.5 text-muted-foreground">Birth / founding date not available yet</td>}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {autoLoading
                ? <p className="text-[10px] mt-2 text-muted-foreground">Loading starters, coaches and birthdays…</p>
                : v.missing.length > 0 && <p className="text-[10px] mt-2 text-muted-foreground">Not available yet: {[...new Set(v.missing)].join(" · ")}</p>}
            </Fold>
          </div>
        )}
      </div>
    </div>
  );
}

function HitRatePanel() {
  const [r, setR] = useState<ReturnType<typeof stepHitRates> | null>(null);
  const [weights, setWeights] = useState<Record<string, number>>({});
  useEffect(() => {
    const pull = () => { setR(stepHitRates()); setWeights(layerWeights()); };
    pull();
    const t = setInterval(pull, 5000);
    return () => clearInterval(t);
  }, []);
  if (!r) return null;
  return (
    <div>
      <p className="text-sm text-foreground mb-3">Overall: <b>{r.hits}/{r.total}</b>{r.total ? ` (${Math.round(100 * r.hits / r.total)}%)` : ""}.</p>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
        {Object.entries(r.steps).map(([k, s]) => (
          <div key={k} className="rounded-lg bg-muted/40 p-2"><p className="text-[10px] text-muted-foreground">{k}{weights[k] != null ? ` · ×${weights[k].toFixed(2)}` : ""}</p><p className="text-sm font-bold text-foreground">{s.hits}/{s.total} · {s.total ? Math.round(100 * s.hits / s.total) : 0}%</p></div>
        ))}
      </div>
    </div>
  );
}

function HistoryStudy() {
  const [snap, setSnap] = useState(() => savedHistory());
  useEffect(() => {
    const t = setInterval(() => setSnap(savedHistory()), 4000);
    return () => clearInterval(t);
  }, []);
  return (
    <p className="text-[11px] text-white/50">
      {snap.current
        ? `Learned code · ${snap.games.toLocaleString()} games · ${snap.pct}% · through ${snap.through?.[1]}/${snap.through?.[0]}. Same code on every finished game and every game still ahead.`
        : "Saved study is an older code. It is not mixed in. The current learned code scores finished games and games still ahead."}
    </p>
  );
}

function Mini({ label, value, accent = "white" }: { label: string; value: React.ReactNode; accent?: string }) {
  return (
    <div>
      <p className="text-[8px] uppercase tracking-widest font-bold mb-0.5" style={{ color: "rgba(96,165,250,0.7)" }}>{label}</p>
      <p className="text-[13px] font-bold" style={{ color: accent }}>{value}</p>
    </div>
  );
}
function NumInput({ label, value, set, min, max, w = "w-14", readOnly }: { label: string; value: number; set: (n: number) => void; min: number; max: number; w?: string; readOnly?: boolean }) {
  return (
    <div>
      <p className="text-[7px] uppercase tracking-widest mb-1 text-center text-white/30">{label}</p>
      <input type="number" min={min} max={max} value={value} readOnly={readOnly} onChange={e => set(+e.target.value)}
        className={`${w} text-center rounded-lg px-1.5 py-1.5 text-xs font-bold`}
        style={{ background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.1)", color: "white", outline: "none" }} />
    </div>
  );
}
function AthletePersonalDayCard({ month, day, year }: { month: number; day: number; year: number }) {
  const [bm, setBm] = useState(1);
  const [bd, setBd] = useState(1);
  const pd = useMemo(() => calcAthletePersonalDay(bm, bd, month, day, year), [bm, bd, month, day, year]);
  return (
    <div className="rounded-2xl p-4" style={{ background: "#10141c", border: "1px solid rgba(255,255,255,0.08)" }}>
      <p className="text-[10px] font-bold tracking-[0.16em] text-white/40 mb-2">ATHLETE PERSONAL DAY</p>
      <div className="flex gap-2 mb-2">
        <NumInput label="M" value={bm} set={setBm} min={1} max={12} />
        <NumInput label="D" value={bd} set={setBd} min={1} max={31} />
      </div>
      <Mini label="Personal day" value={`${pd.compound}/${pd.reduced}`} accent={YELLOW} />
    </div>
  );
}

export default function SportsPredictionPage() {
  const [mounted, setMounted] = useState(false);
  const today = new Date();
  const [month, setMonth] = useState(today.getMonth() + 1);
  const [day, setDay] = useState(today.getDate());
  const [year, setYear] = useState(today.getFullYear());
  const [league, setLeague] = useState("NBA");
  const userPicked = useRef(false);
  const [games, setGames] = useState<ESPNGame[]>([]);
  const [loading, setLoading] = useState(false);
  const [slateLoading, setSlateLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [allGames, setAllGames] = useState<Record<string, ESPNGame[]>>({});
  const fetchVersion = useRef(0);
  const slateVersion = useRef(0);
  const [code, setCode] = useState<SportsMode>("learned");
  const [board, setBoard] = useState<Record<string, BoardRow>>({});
  const [prices, setPrices] = useState<Record<string, OddsBlock>>({});
  const [outs, setOuts] = useState<Record<string, string[]>>({});
  useEffect(() => { setMounted(true); setCode(sportsMode()); }, []);
  useEffect(() => { setBoard({}); }, [league, month, day, year, code]);
  useEffect(() => {
    let alive = true;
    setPrices({});
    setOuts({});
    Promise.all([fetchFanDuelBoard(league), fetchOuts(league)]).then(([p, o]) => {
      if (!alive) return;
      setPrices(p);
      setOuts(o);
    });
    return () => { alive = false; };
  }, [league]);

  const leagueInfo = getLeagueInfo(league);
  const fetchGames = useCallback(async () => {
    const v = ++fetchVersion.current;
    setLoading(true); setError(null);
    try {
      const r = await fetchESPNGames(league, month, day, year);
      if (fetchVersion.current !== v) return;
      setGames(r);
    } catch {
      if (fetchVersion.current !== v) return;
      setError("Failed to fetch games"); setGames([]);
    } finally {
      if (fetchVersion.current === v) setLoading(false);
    }
  }, [league, month, day, year]);
  useEffect(() => { fetchGames(); }, [fetchGames]);

  const fetchAll = useCallback(async () => {
    const v = ++slateVersion.current;
    setSlateLoading(true);
    setAllGames({});
    const majors = LEAGUE_GROUPS.flatMap((g) => g.leagues);
    await Promise.all(majors.map(async (lg) => {
      try {
        const list = await fetchESPNGames(lg, month, day, year);
        if (slateVersion.current !== v || !list.length) return;
        setAllGames((prev) => ({ ...prev, [lg]: list }));
      } catch { /* league has nothing on this date */ }
    }));
    if (slateVersion.current === v) setSlateLoading(false);
  }, [month, day, year]);
  useEffect(() => { fetchAll(); }, [fetchAll]);

  const onReady = useCallback((row: BoardRow) => {
    setBoard((prev) => (prev[row.id]?.pct === row.pct && prev[row.id]?.pick === row.pick && prev[row.id]?.allow === row.allow ? prev : { ...prev, [row.id]: row }));
  }, []);

  const ov = useOverrides();
  const books = useMemo(() => {
    const by: Record<string, ReturnType<typeof slateLeg>[]> = {};
    for (const [lg, list] of Object.entries(allGames)) {
      by[lg] = list.map((g) => slateLeg(g, year, month, day, lg, ov, code === "learned"));
    }
    return by;
  }, [allGames, year, month, day, code, ov]);
  const sportParlays = LEAGUE_GROUPS.flatMap((g) => g.leagues).map((lg) => ({ lg, legs: bestLegs(books[lg] ?? []) })).filter((x) => x.legs.length > 0);
  const dayReport = (() => {
    const legs = Object.values(books).flat();
    const by = new Map<string, { hits: number; done: number }>();
    let hits = 0, done = 0, open = 0;
    for (const l of legs) {
      if (l.result === "open") { open++; continue; }
      if (l.result === "push") continue;
      done++;
      if (l.result === "hit") hits++;
      const row = by.get(l.league) ?? { hits: 0, done: 0 };
      row.done++;
      if (l.result === "hit") row.hits++;
      by.set(l.league, row);
    }
    return { hits, done, open, pct: done ? Math.round(100 * hits / done) : 0, leagues: [...by.entries()] };
  })();
  const allLegs = (() => {
    const pool: ReturnType<typeof slateLeg>[] = [];
    for (const lg of LEAGUE_GROUPS.flatMap((g) => g.leagues)) {
      const open = (books[lg] ?? []).filter((l) => l.open).sort((a, b) => b.pct - a.pct);
      const hot = open.filter((l) => isBest(l.pct, l.allow));
      pool.push(...(hot.length ? hot : open).slice(0, 2));
    }
    return pool.sort((a, b) => b.pct - a.pct).slice(0, 8);
  })();
  const leagueCounts = useMemo(() => {
    const c: Record<string, number> = {};
    for (const [lg, lgg] of Object.entries(allGames)) if (lgg.length) c[lg] = lgg.length;
    return c;
  }, [allGames]);
  const liveLeagues = LEAGUE_GROUPS.flatMap((g) => g.leagues).filter((l) => (leagueCounts[l] ?? 0) > 0);
  useEffect(() => {
    if (slateLoading) return;
    if (liveLeagues.length && !liveLeagues.includes(league)) setLeague(liveLeagues[0]);
  }, [liveLeagues.join("|"), slateLoading]);

  if (!mounted) return <div className="max-w-3xl" />;
  const rows = Object.values(board);
  const best = rows.filter((r) => r.open && isBest(r.pct, r.allow)).sort((a, b) => (b.allow ?? b.pct) - (a.allow ?? a.pct));

  return (
    <div className="max-w-3xl space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex rounded-xl overflow-hidden" style={{ border: "1px solid rgba(255,255,255,0.1)" }}>
          {(["learned", "original"] as const).map((m) => (
            <button key={m} onClick={() => { setSportsMode(m); setCode(m); }}
              className="px-3 py-2 text-[11px] tracking-wide"
              style={code === m
                ? { background: YELLOW, color: "#000", fontWeight: 800 }
                : { background: "#000", color: YELLOW, fontWeight: 600 }}>
              {m === "learned" ? "Learned Code" : "Original Code"}
            </button>
          ))}
        </div>
        <p className="text-[11px] text-white/40">{month}/{day}/{year} · {leagueInfo.label}</p>
      </div>

      <div className="flex flex-wrap items-end gap-2">
        {[
          { l: "Month", v: month, s: setMonth, min: 1, max: 12 },
          { l: "Day", v: day, s: setDay, min: 1, max: 31 },
          { l: "Year", v: year, s: setYear, min: 2020, max: 2030 },
        ].map((f) => (
          <label key={f.l} className="text-[9px] uppercase tracking-widest text-white/30">
            {f.l}
            <input type="number" min={f.min} max={f.max} value={f.v} onChange={(e) => f.s(+e.target.value)}
              className="block mt-1 w-16 text-center rounded-lg px-2 py-1.5 text-sm font-bold text-white"
              style={{ background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.1)", outline: "none" }} />
          </label>
        ))}
        <button onClick={fetchGames} className="mb-0.5 p-2 rounded-lg text-white/50" style={{ border: "1px solid rgba(255,255,255,0.08)" }}>
          <RefreshCw size={14} className={loading ? "animate-spin" : ""} />
        </button>
      </div>

      {slateLoading && liveLeagues.length === 0 ? (
        <p className="text-[11px]" style={{ color: YELLOW }}>Checking which sports are on.</p>
      ) : liveLeagues.length === 0 ? (
        <p className="text-[12px] text-white/50">No games on {month}/{day}/{year}.</p>
      ) : (
        <div className="flex gap-1.5 overflow-x-auto pb-1">
          {liveLeagues.map((l) => {
            const active = league === l;
            return (
              <button key={l} onClick={() => { userPicked.current = true; setLeague(l); }}
                className="shrink-0 px-2.5 py-1 rounded-full text-[10px] font-semibold"
                style={active ? { background: YELLOW, color: "#000" } : { background: "#000", color: YELLOW, border: "1px solid rgba(255,106,0,0.45)" }}>
                {l} {leagueCounts[l]}
              </button>
            );
          })}
        </div>
      )}

      {dayReport.done + dayReport.open > 0 && (
        <div className="rounded-xl p-3" style={{ background: "#000", border: "1px solid #FF6A00" }}>
          <p className="text-[10px] font-bold tracking-[0.18em]" style={{ color: YELLOW }}>DAY ACCURACY · ALL SPORTS · {month}/{day}/{year}</p>
          <p className="text-2xl font-black text-white mt-1">{dayReport.done ? `${dayReport.hits}/${dayReport.done}` : "—"} <span className="text-[14px]" style={{ color: YELLOW }}>{dayReport.done ? `${dayReport.pct}%` : "no finals yet"}</span></p>
          <p className="text-[11px] text-white/45 mt-1">{dayReport.leagues.map(([lg, r]) => `${lg} ${r.hits}/${r.done}`).join(" · ") || "Waiting on games."}{dayReport.open ? ` · ${dayReport.open} still open` : ""}</p>
        </div>
      )}

      {allLegs.length > 0 && (
        <div className="rounded-xl p-3" style={{ background: "#000", border: "1px solid #FF6A00" }}>
          <p className="text-[10px] font-bold tracking-[0.18em] mb-2" style={{ color: YELLOW }}>ALL SPORTS PARLAY · {month}/{day}/{year}</p>
          <ol className="space-y-1">
            {allLegs.map((r, i) => (
              <li key={r.id} className="flex justify-between gap-3 text-[12px] text-white">
                <span>{i + 1}. {r.league} · {r.pick}</span>
                <span className="font-bold" style={{ color: YELLOW }}>{r.allow != null && r.allow >= 75 ? Math.round(r.allow) : r.pct}%</span>
              </li>
            ))}
          </ol>
        </div>
      )}

      {sportParlays.length > 0 && (
        <div className="space-y-2">
          <p className="text-[10px] font-bold tracking-[0.18em]" style={{ color: YELLOW }}>BEST PARLAY BY SPORT</p>
          {sportParlays.map(({ lg, legs }) => (
            <div key={lg} className="rounded-xl p-3" style={{ background: "#000", border: "1px solid rgba(255,106,0,0.45)" }}>
              <p className="text-[11px] font-black mb-1" style={{ color: YELLOW }}>{lg}</p>
              <ol className="space-y-1">
                {legs.map((r, i) => (
                  <li key={r.id} className="flex justify-between gap-3 text-[12px] text-white">
                    <span>{i + 1}. {r.pick} <span className="text-white/40">· {r.matchup}</span></span>
                    <span className="font-bold shrink-0" style={{ color: YELLOW }}>{r.allow != null && r.allow >= 75 ? Math.round(r.allow) : r.pct}%</span>
                  </li>
                ))}
              </ol>
            </div>
          ))}
        </div>
      )}

      {best.length > 0 && (
        <div className="space-y-2">
          <p className="text-[10px] font-bold tracking-[0.18em]" style={{ color: YELLOW }}>BEST PLAYS · {league}</p>
          {best.map((r) => (
            <div key={r.id} className="rounded-xl px-3 py-2.5 flex items-center justify-between" style={{ background: "#000", border: "1px solid #FF6A00" }}>
              <div>
                <p className="text-[13px] font-bold text-white">{r.matchup}</p>
                <p className="text-[10px] text-white/40">{r.venue}{r.time ? ` · ${r.time}` : ""} · {r.record}</p>
                <p className="text-[12px] font-bold mt-0.5" style={{ color: YELLOW }}>PICK: {r.pick}</p>
              </div>
              <p className="text-2xl font-black" style={{ color: YELLOW }}>{r.allow != null && r.allow >= 75 ? Math.round(r.allow) : r.pct}%</p>
            </div>
          ))}
        </div>
      )}

      {liveLeagues.length > 0 && (loading ? (
        <div className="rounded-2xl p-10 text-center"><Loader2 size={22} className="animate-spin mx-auto mb-2" style={{ color: YELLOW }} /><p className="text-sm text-white/60">Loading {leagueInfo.label}</p></div>
      ) : error ? (
        <div className="rounded-2xl p-8 text-center"><AlertCircle size={20} className="mx-auto mb-2" style={{ color: ROSE }} /><p className="text-sm text-white">{error}</p></div>
      ) : (
        <div className="space-y-3">
          {games.map((g, i) => <GameCard key={`${code}-${g.id}`} game={g} year={year} month={month} day={day} idx={i} league={league} learned={code === "learned"} onReady={onReady} prices={prices} outs={outs} />)}
        </div>
      ))}

      <details className="text-white/40">
        <summary className="text-[10px] tracking-[0.14em] cursor-pointer">STUDY</summary>
        <div className="mt-2 space-y-2">
          <HistoryStudy />
          <HitRatePanel />
          <AthletePersonalDayCard month={month} day={day} year={year} />
        </div>
      </details>
    </div>
  );
}
