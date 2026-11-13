import { calcPersonalDay, calcPersonalYear } from "./numerology";
import { compat, GG33_COLORS, colorNumbers } from "./gg33";
// 7-step vote decoder. Numbers outrank astrology. Colorology scores 0–2 on
// every game. A 9-vibration record is a small penalty on 9-days. Win percentage
// only breaks a remaining tie. Pure functions only.
import { pythagoreanValue } from "./numerology";
import { moonPhase } from "./sports-decode";
import { healingood } from "./healingood";
import { PROFILE } from "./profile";
import { colorsForDay } from "./colorology";
import { layerMultiplier, layerWeights, learningActive } from "./sports-learning";
import { ruleId } from "./sports-rules";
import ruleTable from "./sports-rules.json";
import ratings from "./team-ratings.json";

export type Side = "home" | "away";
export type Step = "Game-day energy" | "Team core" | "Number pairs" | "Chinese zodiac" | "Stars & venue" | "Colors" | "Records";
export interface Vote { side: Side; weight: number; layer: Step; reason: string }

const MASTERS = new Set([11, 22, 33]);
const sumDigits = (n: number) => String(Math.abs(n)).split("").reduce((a, d) => a + Number(d), 0);
export function reduceNum(n: number): number {
  let x = n;
  while (x > 9 && !MASTERS.has(x)) x = sumDigits(x);
  return x;
}
export interface Num { compound: number; reduced: number }
export function lifePath(y: number, m: number, d: number): Num {
  const compound = sumDigits(y) + sumDigits(m) + sumDigits(d);
  return { compound, reduced: reduceNum(compound) };
}
/** Cue franchise date: the month stays whole, so November 1, 1947 is 11+1+21 = 33, not 24/6. */
export function foundingPath(y: number, m: number, d: number): Num {
  const compound = sumDigits(y) + m + sumDigits(d);
  return { compound, reduced: reduceNum(compound) };
}
/** Day-of-month energy: the 8th = 8, the 19th = 19/1, the 28th = 28/1. */
export const dayEnergy = (d: number): Num => ({ compound: d, reduced: reduceNum(d) });
export const ord = (n: number) => `${n}${[11,12,13].includes(n % 100) ? "th" : ["th","st","nd","rd"][n % 10] ?? "th"}`;
export const fmt = (n: Num) => (n.compound === n.reduced ? `${n.reduced}` : `${n.compound}/${n.reduced}`);

/** Does a number touch any of the day's energies? 28 carries both 8 (wealth) and 1. */
function touches(n: Num, day: number[]): boolean {
  const vals = new Set([n.reduced, n.compound]);
  if (n.compound === 28) { vals.add(8); vals.add(1); }
  return day.some(d => vals.has(d));
}

// ── Number pairs ────────────────────────────────────────────────────────────
export function numberRelation(a: number, b: number): "worst" | "enemy" | "soulmate" | "friend" | "same" | "neutral" {
  const p = (x: number, y: number) => (a === x && b === y) || (a === y && b === x);
  if (p(1, 9)) return "worst";
  if (p(3, 4)) return "enemy";
  if (p(7, 11)) return "soulmate";
  if (p(3, 5) || p(3, 7)) return "friend";
  if (a === b) return "same";
  // GG33 compatibility chart
  const x = compat(a, b).rel, y = compat(b, a).rel;
  if (x === "enemy" || y === "enemy") return "enemy";
  if (x === "friendly") return "friend";
  return "neutral";
}

// ── Chinese zodiac ──────────────────────────────────────────────────────────
export const SIGNS = ["Rat", "Ox", "Tiger", "Cat", "Dragon", "Snake", "Horse", "Goat", "Monkey", "Rooster", "Dog", "Pig"] as const;
export type Sign = typeof SIGNS[number];
export const chineseSign = (year: number): Sign => SIGNS[(((year - 4) % 12) + 12) % 12];
/** Fixed solar-month spans. Tiger opens at Lichun on Feb 4. Rat can open Dec 6 or Dec 7; Pig closes Dec 5, so Rat starts Dec 6. Cat is Mao. Goat is the Wei month. */
export const MONTH_SPAN: Record<Sign, string> = {
  Rat: "Dec 6 / Dec 7 – Jan 5",
  Ox: "Jan 6 – Feb 3",
  Tiger: "Feb 4 – Mar 5",
  Cat: "Mar 6 – Apr 5",
  Dragon: "Apr 6 – May 5",
  Snake: "May 6 – Jun 5",
  Horse: "Jun 6 – Jul 5",
  Goat: "Jul 6 – Aug 5",
  Monkey: "Aug 6 – Sep 5",
  Rooster: "Sep 6 – Oct 5",
  Dog: "Oct 6 – Nov 5",
  Pig: "Nov 6 – Dec 5",
};
export function chineseMonthSign(month: number, day: number): Sign {
  if ((month === 2 && day >= 4) || (month === 3 && day < 6)) return "Tiger";
  const m = day >= 6 ? month : month - 1;
  return SIGNS[((m % 12) + 12) % 12];
}
export const TRINES: Sign[][] = [["Rat", "Monkey", "Dragon"], ["Ox", "Rooster", "Snake"], ["Horse", "Dog", "Tiger"], ["Cat", "Pig", "Goat"]];
export const CLASHES: [Sign, Sign][] = [["Rat", "Horse"], ["Ox", "Goat"], ["Tiger", "Monkey"], ["Cat", "Rooster"], ["Dragon", "Dog"], ["Snake", "Pig"]];
export function signRelation(a: Sign, b: Sign): "friend" | "enemy" | "neutral" {
  if (CLASHES.some(([x, y]) => (x === a && y === b) || (x === b && y === a))) return "enemy";
  if (TRINES.some(t => t.includes(a) && t.includes(b))) return "friend";
  return "neutral";
}
/** Liu He secret friends. Cat stands in for Rabbit, matching this chart. */
const SECRET_FRIEND: Record<Sign, Sign> = { Rat: "Ox", Ox: "Rat", Tiger: "Pig", Pig: "Tiger", Cat: "Dog", Dog: "Cat", Dragon: "Rooster", Rooster: "Dragon", Snake: "Monkey", Monkey: "Snake", Horse: "Goat", Goat: "Horse" };
/** Liu Hai secret enemies (harms), distinct from the six clashes. */
const SECRET_ENEMY: Record<Sign, Sign> = { Rat: "Goat", Goat: "Rat", Ox: "Horse", Horse: "Ox", Tiger: "Snake", Snake: "Tiger", Cat: "Dragon", Dragon: "Cat", Monkey: "Pig", Pig: "Monkey", Rooster: "Dog", Dog: "Rooster" };
export function secretRelation(a: Sign, b: Sign): "secret-friend" | "secret-enemy" | null {
  if (a === b) return null;
  if (SECRET_FRIEND[a] === b) return "secret-friend";
  if (SECRET_ENEMY[a] === b) return "secret-enemy";
  return null;
}

// ── Colors (GG33 colorology only) ───────────────────────────────────────────
export const COLOR_NUMBERS = GG33_COLORS;
/** Primary GG33 number of a color (first listed), or null. */
export function colorNum(name: string): number | null {
  return colorNumbers(name)[0] ?? null;
}
export const colorNumsLabel = (name: string) => colorNumbers(name).join("/") || "?";
export const isWorstPair = (a: number, b: number) => numberRelation(reduceNum(a), reduceNum(b)) === "worst";

export type ColorFamily = "red" | "black" | "blue" | "white" | "gold" | "green" | "other";
export type ColorRel = "friend" | "neutral" | "enemy";

/** Shem color families. Red = 9. Black pairs with red as dangerous. Blue and white are preferred. Gold/yellow = 8-17-26-28. Green = 3 or 8. */
export function colorFamily(name: string): ColorFamily {
  const n = name.trim().toLowerCase();
  if (/red|crimson|scarlet|burgundy|maroon|ruby|cardinal/.test(n)) return "red";
  if (/black|licorice|asphalt/.test(n)) return "black";
  if (/gold|yellow|amber|brass|bronze/.test(n)) return "gold";
  if (/green|emerald/.test(n)) return "green";
  if (/white|ivory|cream|silver|pewter|eggshell/.test(n)) return "white";
  if (/blue|navy|azure|teal|turquoise|aqua|indigo|royal/.test(n)) return "blue";
  return "other";
}

/** One number for jersey resonance. Red and black are 9. Gold is 8. Green is 3. Blue/white fall back to GG33. */
export function sportColorNumber(name: string): number | null {
  const f = colorFamily(name);
  if (f === "red" || f === "black") return 9;
  if (f === "gold") return 8;
  if (f === "green") return 3;
  if (f === "blue") return colorNum(name) ?? 4;
  if (f === "white") return colorNum(name) ?? 1;
  return colorNum(name);
}

const isNineEnergy = (n: number) => n === 9 || reduceNum(n) === 9;
const isWealthEnergy = (n: number) => n === 8 || n === 17 || n === 26 || n === 28 || reduceNum(n) === 8;

export function colorVsEnergy(name: string, n: number): ColorRel {
  const f = colorFamily(name);
  if (f === "red") return isNineEnergy(n) || reduceNum(n) === 1 || n === 1 ? "enemy" : "neutral";
  if (f === "black") return isNineEnergy(n) ? "enemy" : "neutral";
  if (f === "blue" || f === "white") return n === 1 || reduceNum(n) === 1 ? "friend" : "neutral";
  if (f === "gold") return isWealthEnergy(n) ? "friend" : "neutral";
  if (f === "green") return reduceNum(n) === 3 || isWealthEnergy(n) ? "friend" : "neutral";
  return "neutral";
}

export function colorVsColor(a: string, b: string): ColorRel {
  const fa = colorFamily(a), fb = colorFamily(b);
  const danger = (f: ColorFamily) => f === "red" || f === "black";
  const calm = (f: ColorFamily) => f === "blue" || f === "white";
  if (fa !== "other" && fb !== "other") {
    if (fa === fb) return "friend";
    if (danger(fa) && danger(fb)) return "enemy";
    if ((danger(fa) && calm(fb)) || (calm(fa) && danger(fb))) return "enemy";
    if ((fa === "gold" && fb === "green") || (fa === "green" && fb === "gold")) return "friend";
    if ((fa === "gold" || fa === "green") && (calm(fb) || fa === fb)) return "friend";
    if ((fb === "gold" || fb === "green") && calm(fa)) return "friend";
    return "neutral";
  }
  const na = sportColorNumber(a), nb = sportColorNumber(b);
  if (na == null || nb == null) return "neutral";
  const rel = numberRelation(reduceNum(na), reduceNum(nb));
  if (rel === "enemy" || rel === "worst") return "enemy";
  if (rel === "friend" || rel === "same" || rel === "soulmate") return "friend";
  return "neutral";
}

export interface ColorPoint { side: Side; weight: number; reason: string }
export function colorStack(o: {
  homeColor?: string; awayColor?: string;
  dayEnergies: number[];
  homeCycle: number[]; awayCycle: number[];
  homeJersey?: { name: string; numbers: number[] };
  awayJersey?: { name: string; numbers: number[] };
  nineDay: boolean;
}): { points: ColorPoint[]; volatility: string | null } {
  const bag: Record<Side, number> = { home: 0, away: 0 };
  const points: ColorPoint[] = [];
  const give = (side: Side, weight: number, reason: string) => {
    const room = 2 - bag[side];
    const w = Math.round(Math.min(weight, room) * 100) / 100;
    if (w <= 0) return;
    bag[side] = Math.round((bag[side] + w) * 100) / 100;
    points.push({ side, weight: w, reason });
  };
  const fold = (nums: number[], color: string): ColorRel => {
    let rel: ColorRel = "neutral";
    for (const n of nums) {
      const r = colorVsEnergy(color, n);
      if (r === "enemy") return "enemy";
      if (r === "friend") rel = "friend";
    }
    return rel;
  };
  const dayLine = (side: Side, color: string | undefined, who: string) => {
    if (!color) return;
    const rel = fold(o.dayEnergies, color);
    const n = sportColorNumber(color);
    if (rel === "friend") give(side, 0.5, `${who} ${color}${n != null ? ` (${n})` : ""} is friendly with today's energy`);
    if (rel === "enemy") give(side === "home" ? "away" : "home", 0.5, `${who} ${color}${n != null ? ` (${n})` : ""} is an enemy color for today's energy`);
  };
  const cycleLine = (side: Side, color: string | undefined, who: string, cycle: number[]) => {
    if (!color || !cycle.length) return;
    const rel = fold(cycle, color);
    if (rel === "friend") give(side, 0.5, `${who} ${color} fits their own personal cycle`);
    if (rel === "enemy") give(side === "home" ? "away" : "home", 0.5, `${who} ${color} clashes with their own personal cycle (9-day / 9-cycle or red on a 1)`);
  };
  dayLine("home", o.homeColor, "Home");
  dayLine("away", o.awayColor, "Away");
  cycleLine("home", o.homeColor, "Home", o.homeCycle);
  cycleLine("away", o.awayColor, "Away", o.awayCycle);
  if (o.homeColor && o.awayColor) {
    const rel = colorVsColor(o.awayColor, o.homeColor);
    if (rel === "enemy") give("home", 0.5, `Away ${o.awayColor} vs stadium ${o.homeColor} — enemy colors, building favors home`);
    if (rel === "friend") give("away", 0.25, `Away ${o.awayColor} vs stadium ${o.homeColor} — friendly, road colors are not clashing`);
  }
  const jerseyLine = (side: Side, color: string | undefined, jersey?: { name: string; numbers: number[] }) => {
    if (!color || !jersey) return;
    const cn = sportColorNumber(color);
    if (cn == null) return;
    const hit = jersey.numbers.some(n => n === cn || reduceNum(n) === reduceNum(cn));
    if (hit) give(side, 0.5, `${jersey.name} jersey color ${color} (${cn}) matches their Lucky Number or Personal Day`);
  };
  jerseyLine("home", o.homeColor, o.homeJersey);
  jerseyLine("away", o.awayColor, o.awayJersey);
  const danger = (c?: string) => !!c && (colorFamily(c) === "red" || colorFamily(c) === "black");
  const volatility = o.nineDay && danger(o.homeColor) && danger(o.awayColor)
    ? "Both teams wear red/black on a 9-day — high volatility. Fade the lean or take the under."
    : null;
  return { points, volatility };
}

export type ChartTone = "Beneficial" | "Soulmate" | "Lovers" | "Fatal" | "Challenging" | "Neutral";
/** Healingood tone of a target month/day on a birth or founding chart. */
export function chartTone(birth: readonly [number, number, number], target: readonly [number, number, number]): ChartTone {
  const [, bm, bd] = birth;
  const [, tm, td] = target;
  if (bm === tm && bd === td) return "Beneficial";
  const h = healingood(bm, bd);
  const hit = (k: keyof typeof h) => h[k].some(([m, d]) => m === tm && d === td);
  if (hit("fatal")) return "Fatal";
  if (hit("soulmate")) return "Soulmate";
  if (hit("beneficial")) return "Beneficial";
  if (hit("lovers")) return "Lovers";
  if (hit("challenging")) return "Challenging";
  return "Neutral";
}

/** Wins + losses reduced. A 9 root is the 9-vibration record. */
export function recordVibration(rec?: string): number | null {
  const m = rec?.match(/(\d+)\s*-\s*(\d+)/);
  if (!m) return null;
  return reduceNum(Number(m[1]) + Number(m[2]));
}
const RANKS = ["A", "2", "3", "4", "5", "6", "7", "8", "9", "10", "J", "Q", "K"];
const SUITS = ["♥", "♣", "♦", "♠"];
export function birthCardOf(month: number, day: number): string {
  const v = 55 - (2 * month + day);
  if (v <= 0) return "Joker";
  return `${RANKS[(v - 1) % 13]}${SUITS[Math.floor((v - 1) / 13)]}`;
}
function isoWeekNum(y: number, m: number, d: number): number {
  const t = new Date(Date.UTC(y, m - 1, d));
  const day = t.getUTCDay() || 7;
  t.setUTCDate(t.getUTCDate() + 4 - day);
  const y0 = Date.UTC(t.getUTCFullYear(), 0, 1);
  return Math.ceil(((t.getTime() - y0) / 86400000 + 1) / 7);
}
const ECLIPSES: Record<string, string> = {
  "2025-03-14": "Total lunar eclipse",
  "2025-03-29": "Partial solar eclipse",
  "2025-09-07": "Total lunar eclipse",
  "2025-09-21": "Partial solar eclipse",
  "2026-02-17": "Annular solar eclipse",
  "2026-03-03": "Total lunar eclipse",
  "2026-08-12": "Total solar eclipse",
  "2026-08-28": "Partial lunar eclipse",
  "2027-02-06": "Annular solar eclipse",
  "2027-02-20": "Penumbral lunar eclipse",
  "2027-07-18": "Penumbral lunar eclipse",
  "2027-08-02": "Total solar eclipse",
  "2027-08-17": "Penumbral lunar eclipse",
  "2028-01-12": "Partial lunar eclipse",
  "2028-01-26": "Annular solar eclipse",
  "2028-07-06": "Partial lunar eclipse",
  "2028-07-22": "Total solar eclipse",
  "2028-12-31": "Total lunar eclipse",
};

// ── Special numbers ─────────────────────────────────────────────────────────
export const SPECIAL_NUMBERS: Record<number, string> = {
  27: "27 is an important number in sports (baseball)",
  18: "18 is a very important number in gambling",
  3: "3 is luck",
  12: "12 is beginner's luck that can't be repeated",
};

// ── Inputs ──────────────────────────────────────────────────────────────────
export interface VotePerson { name: string; role: "pitcher" | "manager" | "coach" | "quarterback" | "player"; dob?: string; jersey?: string }
export interface VoteTeam { name: string; founded?: [number, number, number]; colors?: string[]; record?: string; split?: string; form?: string; splitHome?: string; splitRoad?: string; rest?: number; outs?: number; h2hWins?: number; people: VotePerson[] }
export interface VoteInput {
  year: number; month: number; day: number; league?: string;
  home: VoteTeam; away: VoteTeam;
  stadiumOpened?: [number, number, number]; cityFounded?: [number, number, number];
  stadium?: string; city?: string;
  /** Kickoff hour in local 0–23. Closing hour is kickoff + 3. */
  hour?: number;
  /** Individual sport (UFC): `founded` is the fighter's birth date. */
  individual?: boolean;
}
export interface TeamRead { lp?: Num; foundedDay?: Num; sign?: Sign; name: Num; enemyYear: boolean; hits: string[] }
export interface EntityProfile {
  side: Side | "venue"; role: string; name: string; date?: string;
  lp?: Num; dayOfYear?: number; dayEnergy?: Num; yearSign?: Sign; monthSign?: Sign;
  pd?: Num; pdRel?: string; lucky?: number;
}
/** CUE Lucky Number: first digit of birth month + last non-zero digit of birth year, kept whole. */
export function luckyNumber(year: number, month: number): number {
  const m = String(month)[0];
  const y = [...String(year)].reverse().find(c => c !== "0") ?? "0";
  return Number(m + y);
}
export function dayOfYear(y: number, m: number, d: number): number {
  return Math.round((Date.UTC(y, m - 1, d) - Date.UTC(y, 0, 1)) / 86400000) + 1;
}
export function personalDayFor(b: readonly [number, number, number], y: number, m: number, d: number): Num {
  const p = calcPersonalDay(b[1], b[2], m, d, y); return { compound: p.compound, reduced: p.reduced };
}
export interface VoteFlags {
  colorHome: number;
  colorAway: number;
  wealth: string | null;
  userChart: string;
  volatility: string | null;
  masters: string[];
  record9: string[];
  stadium: string[];
  hour: string;
  equalMasters: boolean;
}
export interface VoteDecision {
  /** Absolute vote gap. The card applies +3 to the vote plus the full decode. */
  margin: number;
  threshold: number;
  hard: string[];
  cautions: string[];
  volatility: string[];
  bettor: string[];
  powerColor: string;
  manifestation: string | null;
  eclipse: string | null;
  lunar: string;
}
export interface VoteResult {
  entities: EntityProfile[]; gameDayOfYear: number;
  votes: Vote[]; home: number; away: number; pick: Side; tiebreak: boolean;
  universalDay: Num; dayOfMonth: Num; yearSign: Sign; monthSign: Sign;
  noPlay: boolean; alerts: string[]; notes: string[]; missing: string[];
  reads: Record<Side, TeamRead>;
  steps: StepRow[]; confidence: number; band: Band;
  flags: VoteFlags;
  decision: VoteDecision;
}
export const STEP_ORDER: Step[] = ["Team core", "Game-day energy", "Number pairs", "Chinese zodiac", "Stars & venue", "Colors", "Records"];
export const STEP_LABELS: Record<Step, string> = {
  "Team core": "1 · Identity", "Game-day energy": "2 · Game-day energy", "Number pairs": "3 · Number pairs",
  "Chinese zodiac": "4 · Chinese zodiac", "Stars & venue": "5 · Stars, venue & moon", "Colors": "6 · Colorology (0–2)", "Records": "7 · Records",
};
export interface StepRow { step: Step; label: string; edge: Side | null; reason: string }
export type Band = "Challenging" | "Mixed" | "Good" | "Strong" | "Exceptional";
export function confidenceBand(c: number): Band {
  if (c >= 85) return "Exceptional";
  if (c >= 70) return "Strong";
  if (c >= 50) return "Good";
  if (c >= 30) return "Mixed";
  return "Challenging";
}
/** Picked side's share of votes, minus penalties, clamped 0–100. */
export function computeConfidence(o: { winner: number; loser: number; noPlay: boolean; alerts: number; missing: number; tiebreakOnly: boolean }): number {
  const tot = o.winner + o.loser;
  let c = tot ? (100 * o.winner) / tot : 50;
  if (o.noPlay) c -= 30;
  c -= 10 * o.alerts;
  c -= 5 * o.missing;
  if (o.tiebreakOnly) c -= 10;
  return Math.max(0, Math.min(100, Math.round(c)));
}

const RATING_HOME: Record<string, number> = { MLB: 28, NFL: 48, NHL: 35, NBA: 50 };
const RATING_B2B: Record<string, number> = { MLB: 0, NFL: 0, NHL: 50, NBA: 40 };
function teamRatingVote(inp: VoteInput, add: (side: Side, weight: number, layer: Step, reason: string) => void) {
  if (inp.individual) return false;
  const league = inp.league ?? "";
  const table = (ratings as Record<string, Record<string, { elo: number; last: string }>>)[league];
  const home = table?.[inp.home.name];
  const away = table?.[inp.away.name];
  if (!home || !away) return false;
  const game = Date.UTC(inp.year, inp.month - 1, inp.day);
  const rest = (last: string) => (game - Date.parse(last + "T00:00:00Z")) / 86400000;
  const neutral = home.elo - away.elo;
  let adj = neutral + (RATING_HOME[league] ?? 0);
  const b2b = RATING_B2B[league] ?? 0;
  const tired = (last: string) => { const d = rest(last); return d >= 0 && d < 1.4; };
  const homeTired = tired(home.last), awayTired = tired(away.last);
  if (homeTired) adj -= b2b;
  if (awayTired) adj += b2b;
  // Same rest: home court does not flip a visitor that is better on rating and record.
  if (league === "NBA" && homeTired === awayTired && neutral < 0 && adj >= 0 && winPct(inp.away.record) != null && winPct(inp.home.record) != null && (winPct(inp.away.record) as number) > (winPct(inp.home.record) as number)) {
    adj = neutral;
  }
  const hp0 = winPct(inp.home.record), ap0 = winPct(inp.away.record);
  // A one-win record gap is a toss-up. Home keeps it unless the visitor is 150 points better.
  if (league === "NBA" && hp0 != null && ap0 != null && Math.abs(hp0 - ap0) < 0.05 && Math.abs(neutral) < 150) adj = RATING_HOME.NBA;
  if (league === "NHL") {
    const pts = (r?: string) => {
      const m = r?.match(/(\d+)-(\d+)(?:-(\d+))?/);
      if (!m) return null;
      const w = +m[1], l = +m[2], o = m[3] ? +m[3] : 0;
      const g = w + l + o;
      return g ? (2 * w + o) / (2 * g) : null;
    };
    const hpts = pts(inp.home.record), apts = pts(inp.away.record);
    if (Math.abs(neutral) < 15) adj = neutral;
    if (hpts != null && apts != null && apts > hpts && Math.abs(neutral) < 25) adj = -Math.abs(neutral) - 1;
  }
  const side: Side = adj >= 0 ? "home" : "away";
  const better = side === "home" ? inp.home.name : inp.away.name;
  add(side, Math.round(Math.abs(adj) / 40 * 100) / 100, "Records", `Team rating — ${better} ${Math.abs(Math.round(adj))} points clear`);
  return true;
}
const winPct = (r?: string) => {
  const m = r?.match(/(\d+)-(\d+)/); if (!m) return null;
  const w = +m[1], l = +m[2]; return w + l ? w / (w + l) : null;
};
const parseDob = (s?: string) => { const m = s?.match(/^(\d{4})-(\d{2})-(\d{2})/); return m ? [+m[1], +m[2], +m[3]] as const : null; };

function coreStrength(r: TeamRead): number {
  if (!r.lp) return 0;
  if (r.lp.compound === 28 || r.foundedDay?.compound === 28) return 3;
  if ([8, 1, 11, 22, 33].includes(r.lp.reduced)) return 2;
  return 1;
}

/** Championship rules: never back these to win it all. */
export function championshipAlerts(p: VotePerson, league?: string): string[] {
  const d = parseDob(p.dob); if (!d) return [];
  const lp = lifePath(d[0], d[1], d[2]); const sg = chineseSign(d[0]); const out: string[] = [];
  if (league === "NFL" && p.role === "quarterback") {
    if (lp.reduced === 9 || reduceNum(d[2]) === 9) out.push(`Never bet on ${p.name} (9 Life Path / 9 day QB) to win the Super Bowl`);
    if (["Cat", "Goat", "Tiger"].includes(sg)) out.push(`Never bet on ${p.name} (${sg}-year QB) to win the Super Bowl`);
  }
  if (league === "NBA" && lp.reduced === 9) out.push(`Never bet on ${p.name} (9 Life Path) to win the title`);
  return out;
}

export function runVotes(inp: VoteInput): VoteResult {
  const ud = lifePath(inp.year, inp.month, inp.day);
  const dom = dayEnergy(inp.day);
  const dayNums = [...new Set([ud.reduced, dom.reduced, ...(dom.compound === 28 ? [8, 1] : [])])];
  const yearSign = chineseSign(inp.year);
  const monthSign = chineseMonthSign(inp.month, inp.day);
  const votes: Vote[] = []; const alerts: string[] = []; const notes: string[] = []; const missing: string[] = [];
  const add = (side: Side, weight: number, layer: Step, reason: string) => votes.push({ side, weight, layer, reason });
  const other = (s: Side): Side => (s === "home" ? "away" : "home");
  const teams: [Side, VoteTeam][] = [["home", inp.home], ["away", inp.away]];

  const reads = {} as Record<Side, TeamRead>;
  for (const [s, t] of teams) {
    const name = pythagoreanValue(t.name);
    const r: TeamRead = { name: { compound: name.compound, reduced: name.reduced }, enemyYear: false, hits: [] };
    if (t.founded) {
      const [y, m, d] = t.founded;
      r.lp = (inp.individual ? lifePath : foundingPath)(y, m, d); r.foundedDay = dayEnergy(d); r.sign = chineseSign(y);
      r.enemyYear = signRelation(r.sign, yearSign) === "enemy";
      if (touches(r.lp, dayNums)) r.hits.push(`Life Path ${fmt(r.lp)}`);
      if (touches(r.foundedDay, dayNums)) r.hits.push(`${inp.individual ? "born" : "founded"} on the ${ord(d)} (${fmt(r.foundedDay)})`);
    } else missing.push(`${t.name} ${inp.individual ? "birth date" : "founding date"}`);
    if (touches(r.name, dayNums)) r.hits.push(`letterology ${fmt(r.name)}`);
    reads[s] = r;
  }
  const dayLabel = `${fmt(ud)} & ${dom.reduced}`;
  const entities: EntityProfile[] = [];
  const pdRelTo = (pd: Num) => { const r = pd.reduced === ud.reduced ? "same" : numberRelation(pd.reduced, ud.reduced); return r; };
  const profile = (side: EntityProfile["side"], role: string, name: string, b?: readonly [number, number, number], founding = false) => {
    if (!b) { entities.push({ side, role, name }); return undefined; }
    const [y, m, d] = b; const pd = personalDayFor(b, inp.year, inp.month, inp.day);
    const e: EntityProfile = { side, role, name, date: `${m}/${d}/${y}`, lp: (founding ? foundingPath : lifePath)(y, m, d), dayOfYear: dayOfYear(y, m, d), dayEnergy: dayEnergy(d),
      yearSign: chineseSign(y), monthSign: chineseMonthSign(m, d), lucky: luckyNumber(y, m), pd, pdRel: pdRelTo(pd) };
    entities.push(e); return e;
  };
  const pdVote = (s: Side, e: EntityProfile | undefined, w: number, layer: Step) => {
    if (!e?.pd) return;
    const r = e.pdRel;
    if (r === "same" || r === "friend" || r === "soulmate") add(s, w, layer, `${e.name} is in a Personal ${fmt(e.pd)} Day — ${r === "same" ? "matches" : "friendly with"} the ${ud.reduced} Universal Day`);
    else if (r === "enemy" || r === "worst") add(other(s), w, layer, `${e.name} is in a Personal ${fmt(e.pd)} Day — enemy of the ${ud.reduced} Universal Day`);
  };
  for (const [s, t] of teams) {
    pdVote(s, profile(s, inp.individual ? "Fighter" : "Team", t.name, t.founded, !inp.individual), 1, "Game-day energy");
    for (const p of t.people) pdVote(s, profile(s, p.role === "pitcher" ? "Pitcher" : p.role === "quarterback" ? "QB" : p.role === "coach" || p.role === "manager" ? "Coach" : "Player", p.name, parseDob(p.dob) ?? undefined), 0.5, "Stars & venue");
  }
  if (!inp.individual) {
    if (inp.stadium || inp.stadiumOpened) pdVote("home", profile("venue", "Stadium", inp.stadium ?? "Stadium", inp.stadiumOpened), 0.5, "Stars & venue");
    if (inp.city || inp.cityFounded) pdVote("home", profile("venue", "City", inp.city ?? "City", inp.cityFounded), 0.25, "Stars & venue");
  }

  // Step 1+2: game-day energy (×2)
  const hh = reads.home.hits.length, ah = reads.away.hits.length;
  if (hh !== ah) {
    const s: Side = hh > ah ? "home" : "away";
    add(s, 2, "Game-day energy", `${(s === "home" ? inp.home : inp.away).name} touches today's ${dayLabel}: ${reads[s].hits.join(", ")}${reads[other(s)].hits.length ? "" : " — the other side touches nothing"}`);
  }
  // Team core (×2)
  const hc = coreStrength(reads.home), ac = coreStrength(reads.away);
  if (hc !== ac && hc && ac) {
    const s: Side = hc > ac ? "home" : "away";
    add(s, 2, "Team core", `${(s === "home" ? inp.home : inp.away).name} carries the stronger signature (Life Path ${fmt(reads[s].lp!)}${reads[s].foundedDay?.compound === 28 ? ", founded on the 28th" : ""})`);
  }
  // Step 3: number pairs vs the day
  for (const [s, t] of teams) {
    const lp = reads[s].lp; if (!lp) continue;
    const rel = numberRelation(lp.reduced, ud.reduced);
    if (rel === "worst" || rel === "enemy") add(other(s), 1, "Number pairs", `${t.name} Life Path ${lp.reduced} vs ${ud.reduced} Universal Day — ${rel === "worst" ? "worst-enemy pair" : "enemies"}`);
    if (rel === "soulmate" || rel === "friend") add(s, 1, "Number pairs", `${t.name} Life Path ${lp.reduced} is ${rel === "soulmate" ? "soulmates" : "best friends"} with the ${ud.reduced} day`);
  }
  // Step 4: Chinese year / month
  const hs = reads.home.sign, as = reads.away.sign;
  if (hs && as && hs === as) notes.push(`Both teams are ${hs} — zodiac is a wash`);
  else for (const [s, t] of teams) {
    const sg = reads[s].sign; if (!sg) continue;
    if (reads[s].enemyYear) add(other(s), 1, "Chinese zodiac", `${t.name} (${sg}) is in its enemy year — ${yearSign} year strains it`);
    const yr = signRelation(sg, yearSign) === "friend", mo = signRelation(sg, monthSign) === "friend";
    if (yr || mo) add(s, 1, "Chinese zodiac", `${t.name} (${sg}) shares a trine with the ${[yr && `${yearSign} year`, mo && `${monthSign} month`].filter(Boolean).join(" and ")}`);
    if (!reads[s].enemyYear && signRelation(sg, yearSign) !== "friend") {
      const sec = secretRelation(sg, yearSign);
      if (sec === "secret-friend") add(s, 0.5, "Chinese zodiac", `${t.name} (${sg}) is secret friends (Liu He) with the ${yearSign} year`);
      if (sec === "secret-enemy") add(other(s), 0.5, "Chinese zodiac", `${t.name} (${sg}) is secret enemies (Liu Hai) with the ${yearSign} year`);
    }
    if (signRelation(sg, monthSign) !== "friend" && signRelation(sg, monthSign) !== "enemy") {
      const sec = secretRelation(sg, monthSign);
      if (sec === "secret-friend") add(s, 0.5, "Chinese zodiac", `${t.name} (${sg}) is secret friends (Liu He) with the ${monthSign} month`);
      if (sec === "secret-enemy") add(other(s), 0.5, "Chinese zodiac", `${t.name} (${sg}) is secret enemies (Liu Hai) with the ${monthSign} month`);
    }
  }
  if (!inp.individual) {
    for (const [label, dt, nm] of [["City", inp.cityFounded, inp.city], ["Stadium", inp.stadiumOpened, inp.stadium]] as const) {
      if (!dt) continue;
      const sg = chineseSign(dt[0]);
      const rel = signRelation(sg, yearSign);
      const who = `${label} ${nm ?? ""} (${sg})`;
      if (rel === "friend") add("home", 0.35, "Chinese zodiac", `${who} trines the ${yearSign} year — home building`);
      if (rel === "enemy") add("away", 0.35, "Chinese zodiac", `${who} clashes with the ${yearSign} year`);
      const sec = rel === "neutral" ? secretRelation(sg, yearSign) : null;
      if (sec === "secret-friend") add("home", 0.25, "Chinese zodiac", `${who} is secret friends with the ${yearSign} year`);
      if (sec === "secret-enemy") add("away", 0.25, "Chinese zodiac", `${who} is secret enemies with the ${yearSign} year`);
    }
  }
  // Step 5: stars, coaches, venue (small)
  for (const [s, t] of teams) {
    const oppSign = reads[other(s)].sign;
    if (!t.people.length && !inp.individual) missing.push(`${t.name} starters/coach birthdays`);
    for (const p of t.people) {
      alerts.push(...championshipAlerts(p, inp.league));
      const d = parseDob(p.dob); if (!d) { missing.push(`${p.name} birth date`); continue; }
      const lp = lifePath(d[0], d[1], d[2]); const ps = chineseSign(d[0]);
      if (oppSign) {
        const rel = signRelation(ps, oppSign);
        if (rel === "enemy") add(other(s), 0.5, "Stars & venue", `${p.name} (${ps}) clashes with ${oppSign} opponent`);
        if (rel === "friend") add(s, 0.5, "Stars & venue", `${p.name} (${ps}) is friendly with ${oppSign} opponent`);
        if (rel === "neutral") {
          const sec = secretRelation(ps, oppSign);
          if (sec === "secret-friend") add(s, 0.35, "Chinese zodiac", `${p.name} (${ps}) is secret friends with the ${oppSign} opponent`);
          if (sec === "secret-enemy") add(other(s), 0.35, "Chinese zodiac", `${p.name} (${ps}) is secret enemies with the ${oppSign} opponent`);
        }
      }
      const oppLp = reads[other(s)].lp;
      if ((p.role === "coach" || p.role === "manager") && oppLp) {
        const pd = personalDayFor(d, inp.year, inp.month, inp.day);
        const rel = pd.reduced === oppLp.reduced ? "same" : numberRelation(pd.reduced, oppLp.reduced);
        if (rel === "same" || rel === "friend" || rel === "soulmate") add(s, 0.5, "Stars & venue", `${p.name} Personal Day ${fmt(pd)} is ${rel} with the opposing Life Path ${oppLp.reduced}`);
        if (rel === "enemy" || rel === "worst") add(other(s), 0.5, "Stars & venue", `${p.name} Personal Day ${fmt(pd)} is ${rel} against the opposing Life Path ${oppLp.reduced}`);
      }
      if (touches(lp, dayNums) || touches(dayEnergy(d[2]), dayNums)) add(s, 0.5, "Stars & venue", `${p.name} (LP ${fmt(lp)}, born the ${ord(d[2])}) matches today`);
      const j = Number(p.jersey);
      if (j) {
        const lucky = luckyNumber(d[0], d[1]);
        const hits: string[] = [];
        if (dayNums.includes(j) || dayNums.includes(reduceNum(j))) hits.push("the day");
        if (j === lucky || reduceNum(j) === reduceNum(lucky)) hits.push(`Lucky Number ${lucky}`);
        if (j === lp.compound || j === lp.reduced || reduceNum(j) === lp.reduced) hits.push(`Life Path ${fmt(lp)}`);
        if (hits.length) add(s, 0.5, "Stars & venue", `${p.name} #${j} scores with ${hits.join(", ")}`);
      }
      const card = birthCardOf(d[1], d[2]);
      const oppFounded = (s === "home" ? inp.away : inp.home).founded;
      if (oppFounded && birthCardOf(oppFounded[1], oppFounded[2]) === card) add(s, 0.5, "Stars & venue", `${p.name} birth card ${card} matches the opposing side`);
      const oppCoach = (s === "home" ? inp.away : inp.home).people.find(x => x.role === "coach" || x.role === "manager");
      const oppCoachDob = parseDob(oppCoach?.dob);
      if (oppCoach && oppCoachDob && birthCardOf(oppCoachDob[1], oppCoachDob[2]) === card) add(s, 0.5, "Stars & venue", `${p.name} birth card ${card} matches ${oppCoach.name}`);
    }
  }
  for (const [label, dt, nm] of [["Stadium", inp.stadiumOpened, inp.stadium], ["City", inp.cityFounded, inp.city]] as const) {
    if (!dt || inp.individual) continue;
    const lp = lifePath(dt[0], dt[1], dt[2]);
    if (touches(lp, dayNums)) add("home", 0.5, "Stars & venue", `${label} ${nm ?? ""} (${dt[1]}/${dt[2]}/${dt[0]} → ${fmt(lp)}) matches today`);
  }

  // Lunar phase (secondary): new moon backs the starter (road attacker), full moon the finisher (home)
  const moonInfo = moonPhase(inp.year, inp.month, inp.day);
  const moon = moonInfo.phase;
  const moonRef = Date.UTC(2000, 0, 6) / 86400000;
  const moonDay = Date.UTC(inp.year, inp.month - 1, inp.day) / 86400000;
  const moonCycle = (((moonDay - moonRef) % 29.53059) + 29.53059) % 29.53059;
  const moonIllum = Math.round((1 - Math.cos((2 * Math.PI * moonCycle) / 29.53059)) / 2 * 100);
  if (!inp.individual && moon === "New Moon") add("away", 0.25, "Stars & venue", "New moon (secondary) — starting energy backs the road attacker");
  if (!inp.individual && moon === "Full Moon") add("home", 0.25, "Stars & venue", "Full moon (secondary) — finishing energy backs the home side");
  if (hc && ac && hc !== ac) {
    const favorite: Side = hc > ac ? "home" : "away";
    const dog: Side = favorite === "home" ? "away" : "home";
    if (moonInfo.bias === "FAVORITES") add(favorite, 0.15, "Stars & venue", `Moon ${moonIllum}% — light favorite modifier`);
    if (moonInfo.bias === "UNDERDOGS" || moonInfo.bias === "SLIGHT UNDERDOGS") add(dog, 0.15, "Stars & venue", `Moon ${moonIllum}% — light underdog modifier`);
  }
  notes.push(`Moon: ${moon}, ${moonIllum}% lit. ${moonInfo.biasNote}`);

  if (!inp.individual && inp.stadiumOpened) {
    for (const [s, t] of teams) {
      if (!t.founded) continue;
      const tone = chartTone(t.founded, inp.stadiumOpened);
      const label = `${inp.stadium ?? "Stadium"} opened ${inp.stadiumOpened[1]}/${inp.stadiumOpened[2]}/${inp.stadiumOpened[0]} — ${tone} on ${t.name}'s chart`;
      notes.push(label);
      if (tone === "Beneficial" || tone === "Soulmate" || tone === "Lovers") add(s, 0.5, "Stars & venue", label);
      if (tone === "Challenging" || tone === "Fatal") add(other(s), 0.5, "Stars & venue", label);
      if (inp.cityFounded) {
        const cityTone = chartTone(t.founded, inp.cityFounded);
        const bad = (x: ChartTone) => x === "Challenging" || x === "Fatal";
        if (bad(tone) && bad(cityTone)) add(other(s), 1, "Stars & venue", `City (${cityTone}) and stadium (${tone}) are both against ${t.name} — full point penalty`);
      }
    }
  }

  const weekRoot = reduceNum(isoWeekNum(inp.year, inp.month, inp.day));
  const doyRoot = reduceNum(dayOfYear(inp.year, inp.month, inp.day));
  for (const [s, t] of teams) {
    const lp = reads[s].lp; if (!lp) continue;
    if (lp.reduced === weekRoot) add(s, 0.15, "Game-day energy", `${t.name} Life Path ${lp.reduced} matches week-of-year root ${weekRoot}`);
    if (lp.reduced === doyRoot && !reads[s].hits.length) add(s, 0.25, "Game-day energy", `${t.name} Life Path matches day-of-year root ${doyRoot}`);
  }
  const pole = (n: number): "friend" | "enemy" | "neutral" => {
    const r = n === ud.reduced ? "same" : numberRelation(n, ud.reduced);
    if (r === "same" || r === "friend" || r === "soulmate") return "friend";
    if (r === "enemy" || r === "worst") return "enemy";
    return "neutral";
  };
  const hourLines: string[] = [];
  if (inp.hour != null) {
    const hourNum = (pd: number, h: number) => reduceNum(pd + sumDigits(h % 24));
    const watch = (side: Side, who: string, b?: readonly [number, number, number]) => {
      if (!b) return;
      const pd = personalDayFor(b, inp.year, inp.month, inp.day).reduced;
      const start = pole(hourNum(pd, inp.hour!));
      const close = pole(hourNum(pd, inp.hour! + 3));
      if ((start === "friend" && close === "enemy") || (start === "enemy" && close === "friend")) {
        hourLines.push(`${who} flips ${start} → ${close} by the closing hour`);
        if (close === "friend") add(side, 0.75, "Stars & venue", `${who} hour flips to friend at the close — closing hour is the heavy weight`);
        else add(side === "home" ? "away" : "home", 0.75, "Stars & venue", `${who} hour flips to enemy at the close — fade this side late`);
      }
    };
    for (const [s, t] of teams) {
      watch(s, t.name, t.founded);
      const key = t.people.find(p => p.role === "pitcher" || p.role === "quarterback" || p.role === "player");
      watch(s, key?.name ?? "", parseDob(key?.dob) ?? undefined);
    }
  } else hourLines.push("Kickoff hour not on the card yet, so the friend→enemy hour flip is not scored.");
  if (!inp.individual) hourLines.push("No reliever or closer is in the feed. The closing-hour check uses the team and the posted starter.");

  const userTone = chartTone([PROFILE.birthYear, PROFILE.birthMonth, PROFILE.birthDay], [inp.year, inp.month, inp.day]);
  const userChart = `Your chart (${PROFILE.firstName} ${PROFILE.birthDateStr}): this date is ${userTone}.`;
  notes.push(userChart);
  if (userTone === "Fatal") notes.push(`${userChart} Fatal date — volatility is higher, the pick still stands.`);
  if (userTone === "Beneficial" || userTone === "Soulmate" || userTone === "Lovers") notes.push(`Your chart supports today (${userTone}).`);
  if (userTone === "Challenging") notes.push("Your chart — Challenging date. The pick still stands.");

  const bettorBirth = [PROFILE.birthYear, PROFILE.birthMonth, PROFILE.birthDay] as const;
  const bettorPy = calcPersonalYear(PROFILE.birthMonth, PROFILE.birthDay, inp.month, inp.day, inp.year);
  const bettorPm = reduceNum(bettorPy.reduced + inp.month);
  const bettorPd = personalDayFor(bettorBirth, inp.year, inp.month, inp.day);
  const bettorRel = (n: number) => (n === ud.reduced ? "same" : numberRelation(n, ud.reduced));
  const bettor: string[] = [
    `Your Personal Year ${bettorPy.reduced} is ${bettorRel(bettorPy.reduced)} with Universal Day ${ud.reduced}.`,
    `Your Personal Month ${bettorPm} is ${bettorRel(bettorPm)} with the day.`,
    `Your Personal Day ${fmt(bettorPd)} is ${bettorRel(bettorPd.reduced)} with the day.`,
  ];
  if (["enemy", "worst"].includes(bettorRel(bettorPy.reduced)) || ["enemy", "worst"].includes(bettorRel(bettorPm))) {
    bettor.push("Your personal year or month is an enemy cycle. Noted, the pick still stands.");
  }
  let userHourEnemy = false;
  if (inp.hour != null) {
    const userHour = reduceNum(bettorPd.reduced + sumDigits(inp.hour % 24));
    const userClose = reduceNum(bettorPd.reduced + sumDigits((inp.hour + 3) % 24));
    const hr = pole(userHour), cl = pole(userClose);
    bettor.push(`Your hour at ${inp.hour}:00 is ${userHour} (${hr}). Closing hour is ${userClose} (${cl}).`);
    if (hr === "enemy" || cl === "enemy") userHourEnemy = true;
    if ((hr === "friend" && cl === "enemy") || (hr === "enemy" && cl === "friend")) hourLines.push(`Your own hour flips ${hr} → ${cl}`);
  }
  const power = colorsForDay(ud.reduced, 3);
  const powerColor = `Power colors: ${power.best.slice(0, 3).map(c => c.name).join(", ") || "none"}. Avoid ${power.avoid.slice(0, 2).map(c => c.name).join(", ") || "none"}.`;
  const eclipseKey = `${inp.year}-${String(inp.month).padStart(2, "0")}-${String(inp.day).padStart(2, "0")}`;
  const eclipse = ECLIPSES[eclipseKey] ? `${ECLIPSES[eclipseKey]} — eclipse day. Volatility is higher.` : null;
  if (eclipse) alerts.push(eclipse);
  const manifestation = inp.day === 28 || inp.day === 33 || ud.compound === 28 || ud.compound === 33 || ud.reduced === 33
    ? `Manifestation day — ${inp.day === 28 || ud.compound === 28 ? "28" : "33"} energy is on the card.`
    : null;
  if (manifestation) notes.push(manifestation);
  const nineCycle = entities.filter(e => e.pd && (e.pd.reduced === 9 || e.pd.compound === 9)).map(e => e.name);
  if (bettorPd.reduced === 9) nineCycle.push("you");
  const volatility: string[] = [...hourLines];
  if (nineCycle.length) volatility.push(`9-cycle on ${nineCycle.join(", ")} — volatility, lean the under.`);

  const wealthNums = [8, 17, 26, 28];
  const wealthHit = ud.reduced === 8 || wealthNums.includes(inp.day) || wealthNums.includes(ud.compound);
  const wealth = wealthHit ? `WEALTH DAY — calendar ${inp.day}, universal ${fmt(ud)}. Lean the favorite moneyline and the over.` : null;
  if (wealth) {
    notes.unshift(wealth);
    if (hc && ac && hc !== ac) {
      const s: Side = hc > ac ? "home" : "away";
      const who = s === "home" ? inp.home.name : inp.away.name;
      add(s, 0.5, "Game-day energy", `Wealth-day favorite lean — ${who} has the stronger core`);
    }
  }

  // Special-day notes + hard rule
  for (const n of [ud.compound, inp.day]) if (SPECIAL_NUMBERS[n] && !notes.includes(SPECIAL_NUMBERS[n])) notes.push(SPECIAL_NUMBERS[n]);
  const noPlay = ud.reduced === 9;
  if (noPlay) notes.unshift("9 Universal Day — volatility is high. The pick still stands.");

  const total = (s: Side) => +votes.filter(v => v.side === s).reduce((a, v) => a + v.weight, 0).toFixed(2);
  const name = (sd: Side) => (sd === "home" ? inp.home : inp.away).name;

  const masterWhy = (s: Side): string | null => {
    const bits: string[] = [];
    const lp = reads[s].lp;
    const ent = entities.find(e => e.side === s && (e.role === "Team" || e.role === "Fighter"));
    if (lp && (MASTERS.has(lp.reduced) || MASTERS.has(lp.compound))) bits.push(`Life Path ${fmt(lp)}`);
    if (ent?.pd && (MASTERS.has(ent.pd.reduced) || MASTERS.has(ent.pd.compound))) bits.push(`Personal Day ${fmt(ent.pd)}`);
    return bits.length ? bits.join(" + ") : null;
  };
  const venueMaster = entities
    .filter(e => e.side === "venue" && ((e.lp && (MASTERS.has(e.lp.reduced) || MASTERS.has(e.lp.compound))) || (e.pd && (MASTERS.has(e.pd.reduced) || MASTERS.has(e.pd.compound)))))
    .map(e => `${e.role} ${e.name} on a master`);
  const homeMaster = masterWhy("home");
  const awayMaster = masterWhy("away");
  const masters: string[] = [];
  const boostMaster = (s: Side, why: string) => {
    const base = total(s);
    const extra = Math.max(0.5, Math.round(base * 0.25 * 100) / 100);
    add(s, extra, "Team core", `Master multiplier ×1.25 — ${why} adds ${extra}`);
    masters.push(`${name(s)}: ${why}`);
  };
  if (homeMaster && !awayMaster) boostMaster("home", homeMaster);
  if (awayMaster && !homeMaster) boostMaster("away", awayMaster);
  if (venueMaster.length) boostMaster("home", venueMaster.join("; "));

  let home = total("home"), away = total("away");
  const tiedBeforeColor = home === away;
  const cycleOf = (founded?: [number, number, number]) => {
    if (!founded) return [] as number[];
    const pd = personalDayFor(founded, inp.year, inp.month, inp.day);
    const py = calcPersonalYear(founded[1], founded[2], inp.month, inp.day, inp.year);
    return [pd.reduced, pd.compound, py.reduced];
  };
  const jerseyOf = (t: VoteTeam) => {
    const p = t.people.find(x => x.role === "pitcher" || x.role === "quarterback");
    const d = p ? parseDob(p.dob) : null;
    if (!p || !d) return undefined;
    const pd = personalDayFor(d, inp.year, inp.month, inp.day);
    const lucky = luckyNumber(d[0], d[1]);
    return { name: p.name, numbers: [pd.reduced, pd.compound, lucky, reduceNum(lucky)] };
  };
  const stacked = colorStack({
    homeColor: inp.home.colors?.[0], awayColor: inp.away.colors?.[0],
    dayEnergies: [...new Set([ud.reduced, ud.compound, dom.reduced, dom.compound, inp.day])],
    homeCycle: cycleOf(inp.home.founded), awayCycle: cycleOf(inp.away.founded),
    homeJersey: jerseyOf(inp.home), awayJersey: jerseyOf(inp.away),
    nineDay: noPlay || inp.day === 9,
  });
  for (const p of stacked.points) add(p.side, p.weight, "Colors", p.reason);
  if (stacked.volatility) { alerts.push(stacked.volatility); volatility.push(stacked.volatility); }
  const nineDay = noPlay || inp.day === 9;
  const record9: string[] = [];
  if (nineDay) {
    for (const [s, t] of teams) {
      const roots: string[] = [];
      if (recordVibration(t.record) === 9) roots.push(`record ${t.record}`);
      const splitLabel = s === "home" ? "home split" : "road split";
      if (t.split && recordVibration(t.split) === 9) roots.push(`${splitLabel} ${t.split}`);
      const pct = winPct(t.record);
      const pctRoot = pct == null ? null : reduceNum(Math.round(pct * 100));
      if (pctRoot === 9) roots.push(`win% root 9`);
      if (!roots.length) continue;
      const line = `${t.name} ${roots.join(", ")} vibrates at 9 on a 9-day — penalty`;
      record9.push(line);
      add(other(s), 0.35, "Records", line);
    }
  }
  if ((ud.reduced === 1 || inp.day === 17) && hc && ac && hc !== ac) {
    const gapNow = Math.abs(total("home") - total("away"));
    if (gapNow > 0 && gapNow < 3) {
      const s: Side = hc > ac ? "home" : "away";
      add(s, 0.25, "Game-day energy", `Close stack on a ${inp.day === 17 ? "17th" : "1-day"} — slight favorite and over lean to ${name(s)}`);
      notes.push("1-day / 17th with a close stack: slight favorite moneyline and a lean to the over.");
    }
  }
  if (learningActive()) {
    const rated = teamRatingVote(inp, add);
    const hp = winPct(inp.home.record), ap = winPct(inp.away.record);
    const played = (r?: string) => { const m = r?.match(/(\d+)-(\d+)/); return m ? +m[1] + +m[2] : 0; };
    if (hp != null && ap != null && hp !== ap && played(inp.home.record) >= 8 && played(inp.away.record) >= 8) {
      const gap = Math.abs(hp - ap);
      const band = gap >= 0.5 ? 50 : gap >= 0.4 ? 40 : gap >= 0.3 ? 30 : gap >= 0.15 ? 15 : 0;
      if (band) {
        const s: Side = hp > ap ? "home" : "away";
        const better = s === "home" ? inp.home : inp.away;
        const worse = s === "home" ? inp.away : inp.home;
        add(s, 1, "Records", `Better record gap ${band} — ${better.name} ${better.record} over ${worse.name} ${worse.record}`);
      }
      const s: Side = hp > ap ? "home" : "away";
      const better = s === "home" ? inp.home : inp.away;
      const worse = s === "home" ? inp.away : inp.home;
      add(s, Math.abs(hp - ap), "Records", `Record margin — ${better.name} ${better.record} over ${worse.name} ${worse.record}`);
    } else if (!rated && hp != null && ap != null && hp !== ap && played(inp.home.record) >= 2 && played(inp.away.record) >= 2) {
      const gap = Math.abs(hp - ap);
      const band = gap >= 0.5 ? 50 : gap >= 0.4 ? 40 : gap >= 0.3 ? 30 : gap >= 0.15 ? 15 : 0;
      if (band) {
        const s: Side = hp > ap ? "home" : "away";
        const better = s === "home" ? inp.home : inp.away;
        const worse = s === "home" ? inp.away : inp.home;
        add(s, 1, "Records", `Better record gap ${band} — ${better.name} ${better.record} over ${worse.name} ${worse.record}`);
      }
    }
    if (!inp.individual) add("home", rated ? 0 : 1, "Records", "Home field");
    const bandOf = (gap: number) => gap >= 0.5 ? 50 : gap >= 0.4 ? 40 : gap >= 0.3 ? 30 : gap >= 0.15 ? 15 : 0;
    const leanLine = (homeRec: string | undefined, awayRec: string | undefined, min: number, label: string, weights: Record<number, number>) => {
      const hpct = winPct(homeRec), apct = winPct(awayRec);
      if (hpct == null || apct == null || hpct === apct || played(homeRec) < min || played(awayRec) < min) return;
      const formBand = bandOf(Math.abs(hpct - apct));
      if (!formBand) return;
      const s: Side = hpct > apct ? "home" : "away";
      const better = s === "home" ? inp.home : inp.away;
      const worse = s === "home" ? inp.away : inp.home;
      add(s, weights[formBand], "Records", `${label} ${formBand} — ${better.name} ${s === "home" ? homeRec : awayRec} over ${worse.name} ${s === "home" ? awayRec : homeRec}`);
    };
    leanLine(inp.home.form, inp.away.form, 4, "Recent form gap", { 50: 0, 40: 0, 30: 0, 15: 0 });
    leanLine(inp.home.splitHome, inp.away.splitRoad, 5, "Home and road gap", { 50: 0, 40: 0, 30: 0, 15: 0 });
    if (inp.home.rest != null && inp.away.rest != null) {
      const homeTired = inp.home.rest <= 1, awayTired = inp.away.rest <= 1;
      if (homeTired !== awayTired) {
        const tired = homeTired ? inp.home.name : inp.away.name;
        add(homeTired ? "away" : "home", 0, "Records", `Back to back — ${tired} played yesterday, the other side is rested`);
      }
    }
    if (inp.home.outs != null && inp.away.outs != null && inp.home.outs !== inp.away.outs) {
      const homeHurt = inp.home.outs > inp.away.outs;
      const hurt = homeHurt ? inp.home : inp.away;
      add(homeHurt ? "away" : "home", 0, "Records", `Injury count — ${hurt.name} has more players out (${Math.max(inp.home.outs, inp.away.outs)} to ${Math.min(inp.home.outs, inp.away.outs)})`);
    }
    if (inp.home.h2hWins != null && inp.away.h2hWins != null && inp.home.h2hWins + inp.away.h2hWins >= 2 && inp.home.h2hWins !== inp.away.h2hWins) {
      const s: Side = inp.home.h2hWins > inp.away.h2hWins ? "home" : "away";
      add(s, 0, "Records", `Head to head gap — ${(s === "home" ? inp.home : inp.away).name} leads the season series ${Math.max(inp.home.h2hWins, inp.away.h2hWins)}-${Math.min(inp.home.h2hWins, inp.away.h2hWins)}`);
    }
  }
  const specific = ruleTable as Record<string, { total?: number; weight?: number }>;
  const useRules = learningActive() && Object.keys(specific).length > 0;
  const adaptiveWeights = learningActive() ? layerWeights() : {};
  const studyMultipliers: Partial<Record<Step, number>> = {};
  for (const v of votes) {
    if (useRules) {
      const row = specific[ruleId(v.reason)];
      if (row && (row.total ?? 0) >= 100) v.weight = Math.round(v.weight * (row.weight ?? 0) * 100) / 100;
    }
    // Use direct device learning when present; otherwise fall back to the
    // current-code layer study. Never multiply the same feedback twice.
    const learnedMultiplier = adaptiveWeights[v.layer] ?? (studyMultipliers[v.layer] ??= layerMultiplier(v.layer));
    if (learnedMultiplier !== 1) v.weight = Math.round(v.weight * learnedMultiplier * 100) / 100;
  }
  const ratingVote = votes.find(v => ruleId(v.reason) === "team-rating");
  const favName = ratingVote ? (ratingVote.side === "home" ? inp.home.name : inp.away.name) : "";
  const dogName = ratingVote ? (ratingVote.side === "home" ? inp.away.name : inp.home.name) : "";
  const dogSide: Side = ratingVote?.side === "home" ? "away" : "home";
  const dropRating = !!(ratingVote && inp.league === "NBA"
    && votes.some(v => v.reason.startsWith(favName) && /enemy of the/.test(v.reason))
    && votes.some(v => v.reason.startsWith(dogName) && /friendly with the|matches the/.test(v.reason))
    && winPct(inp.home.record) != null && winPct(inp.away.record) != null
    && (dogSide === "away" ? (winPct(inp.away.record) as number) > (winPct(inp.home.record) as number) : (winPct(inp.home.record) as number) > (winPct(inp.away.record) as number))
    && Math.abs((winPct(inp.home.record) as number) - (winPct(inp.away.record) as number)) >= 0.05);
  if (dropRating && ratingVote) ratingVote.weight = 0;
  if (ratingVote && !dropRating) {
    const mine = total(ratingVote.side);
    const opp = total(ratingVote.side === "home" ? "away" : "home");
    if (mine <= opp) ratingVote.weight = Math.round((ratingVote.weight + opp - mine + 0.01) * 100) / 100;
  }
  home = total("home"); away = total("away");
  let tiebreak = false;
  let tiePick: Side | null = null;
  if (home === away) {
    tiebreak = true;
    const h = winPct(inp.home.record), a = winPct(inp.away.record);
    const hasRecordEdge = h != null && a != null && h !== a;
    const s: Side = hasRecordEdge
      ? (h > a ? "home" : "away")
      : inp.individual
        ? (inp.home.name.localeCompare(inp.away.name, undefined, { sensitivity: "base" }) <= 0 ? "home" : "away")
        : "home";
    tiePick = s;
    const reason = hasRecordEdge
      ? `Tiebreaker: better record (${s === "home" ? inp.home.record : inp.away.record})`
      : inp.individual
        ? "Tiebreaker: neutral fighter ordering"
        : "Tiebreaker: home field";
    add(s, inp.individual && !hasRecordEdge ? 0 : 0.1, "Records", reason);
    home = total("home"); away = total("away");
  } else if (tiedBeforeColor) tiebreak = true;
  const pick: Side = home > away ? "home" : away > home ? "away" : inp.individual && tiePick ? tiePick : "home";
  const noEdge: Record<Step, string> = {
    "Team core": !reads.home.lp || !reads.away.lp ? `${inp.individual ? "Birth" : "Founding"} date missing for one side` : `Equal core signatures (${fmt(reads.home.lp)} vs ${fmt(reads.away.lp)})`,
    "Game-day energy": hh || ah ? `Both sides touch today's ${dayLabel} equally` : `Neither side touches today's ${dayLabel}`,
    "Number pairs": `No enemy or friend pair with the ${ud.reduced} day`,
    "Chinese zodiac": hs && as && hs === as ? `Both are ${hs} — a wash` : `No enemy year or trine with the ${yearSign} year / ${monthSign} month`,
    "Stars & venue": missing.some(m => /birth|starters/.test(m)) ? "No matches — some birth dates not available yet" : "No player, venue or moon matches today",
    "Colors": "No color edge — primaries missing, neutral, or capped even",
    "Records": nineDay ? "Neither record vibrates at 9" : "Not a 9-day — record vibration stays quiet. Win percentage only breaks a tie.",
  };
  const steps: StepRow[] = STEP_ORDER.map(st => {
    const vs = votes.filter(x => x.layer === st);
    const w = { home: 0, away: 0 }; vs.forEach(x => (w[x.side] += x.weight));
    const edge: Side | null = w.home === w.away ? null : w.home > w.away ? "home" : "away";
    return { step: st, label: STEP_LABELS[st], edge, reason: vs.length ? vs.map(x => `${name(x.side)}: ${x.reason}`).join(" · ") : noEdge[st] };
  });
  const coreMissing = new Set(missing.filter(m => /date/.test(m))).size;
  const confidence = computeConfidence({
    winner: pick === "home" ? home : away, loser: pick === "home" ? away : home,
    noPlay, alerts: alerts.filter(a => !a.startsWith("9 Universal")).length, missing: coreMissing,
    tiebreakOnly: tiebreak,
  });
  const colorHome = +stacked.points.filter(p => p.side === "home").reduce((a, p) => a + p.weight, 0).toFixed(2);
  const colorAway = +stacked.points.filter(p => p.side === "away").reduce((a, p) => a + p.weight, 0).toFixed(2);
  const stadium = notes.filter(n => /opened /.test(n) && /chart/.test(n));
  const equalMasters = !!(homeMaster && awayMaster);
  const margin = +Math.abs(home - away).toFixed(2);
  const hard: string[] = [];
  if (noPlay) hard.push("9 Universal Day — high volatility.");
  if (userTone === "Fatal") hard.push("Your chart is Fatal today.");
  if (equalMasters) hard.push("Both sides hold a master number — boost is a wash.");
  if (userHourEnemy) hard.push("Your personal hour clashes with the game window.");
  const cautions = [
    "Opening line, closing line, and public % are not in this feed, so they are not scored.",
    ...bettor.filter(b => /enemy/.test(b)),
  ];
  const flags: VoteFlags = {
    colorHome, colorAway, wealth, userChart, volatility: stacked.volatility ?? volatility.find(v => /9-cycle|flips/.test(v)) ?? null, masters, record9, stadium,
    hour: hourLines.filter(h => !/not on the card|reliever/.test(h)).join(" · ") || "Closing hour weight is 0.40, against 0.15 at the start and 0.15 mid-game.",
    equalMasters,
  };
  const decision: VoteDecision = {
    margin, threshold: 3, hard, cautions, volatility, bettor, powerColor, manifestation, eclipse,
    lunar: `Moon ${moon}, ${moonIllum}% lit. ${moonInfo.bias} — ${moonInfo.biasNote}`,
  };
  return { entities, gameDayOfYear: dayOfYear(inp.year, inp.month, inp.day), votes, home, away, pick, tiebreak, universalDay: ud, dayOfMonth: dom, yearSign, monthSign, noPlay, alerts, notes, missing, reads, steps, confidence, band: confidenceBand(confidence), flags, decision };
}

/** Team colors (primary first). */
export const TEAM_COLORS: Record<string, string[]> = {
  "Arizona Diamondbacks": ["Red", "Black"], "Atlanta Braves": ["Navy", "Red"], "Baltimore Orioles": ["Orange", "Black"], "Boston Red Sox": ["Red", "Navy"],
  "Chicago Cubs": ["Blue", "Red"], "Chicago White Sox": ["Black", "White"], "Cincinnati Reds": ["Red", "White"], "Cleveland Guardians": ["Navy", "Red"],
  "Colorado Rockies": ["Purple", "Black"], "Detroit Tigers": ["Navy", "Orange"], "Houston Astros": ["Navy", "Orange"], "Kansas City Royals": ["Blue", "Gold"],
  "Los Angeles Angels": ["Red", "Navy"], "Los Angeles Dodgers": ["Blue", "White"], "Miami Marlins": ["Black", "Blue"], "Milwaukee Brewers": ["Navy", "Gold"],
  "Minnesota Twins": ["Navy", "Red"], "New York Mets": ["Blue", "Orange"], "New York Yankees": ["Navy", "White"], "Athletics": ["Green", "Gold"],
  "Oakland Athletics": ["Green", "Gold"], "Philadelphia Phillies": ["Red", "Blue"], "Pittsburgh Pirates": ["Black", "Gold"], "San Diego Padres": ["Brown", "Gold"],
  "San Francisco Giants": ["Orange", "Black"], "Seattle Mariners": ["Navy", "Teal"], "St. Louis Cardinals": ["Red", "Navy"], "Tampa Bay Rays": ["Navy", "Blue"],
  "Texas Rangers": ["Blue", "Red"], "Toronto Blue Jays": ["Blue", "Navy"], "Washington Nationals": ["Red", "Navy"],
  "Dallas Cowboys": ["Navy", "Silver"], "Tampa Bay Buccaneers": ["Red", "Pewter"], "Kansas City Chiefs": ["Red", "Gold"], "Philadelphia Eagles": ["Green", "Silver"],
  "Green Bay Packers": ["Green", "Gold"], "San Francisco 49ers": ["Red", "Gold"], "Pittsburgh Steelers": ["Black", "Gold"], "Baltimore Ravens": ["Purple", "Black"],
  "Las Vegas Raiders": ["Black", "Silver"], "Minnesota Vikings": ["Purple", "Gold"], "New England Patriots": ["Navy", "Red"], "Buffalo Bills": ["Blue", "Red"],
  "Chicago Bears": ["Navy", "Orange"], "Detroit Lions": ["Blue", "Silver"], "New York Giants": ["Blue", "Red"], "New York Jets": ["Green", "White"],
  "Miami Dolphins": ["Aqua", "Orange"], "Denver Broncos": ["Orange", "Navy"], "Seattle Seahawks": ["Navy", "Green"], "Los Angeles Rams": ["Blue", "Yellow"],
  "Los Angeles Chargers": ["Blue", "Gold"], "Cincinnati Bengals": ["Orange", "Black"], "Cleveland Browns": ["Brown", "Orange"], "Houston Texans": ["Navy", "Red"],
  "Indianapolis Colts": ["Blue", "White"], "Jacksonville Jaguars": ["Teal", "Black"], "Tennessee Titans": ["Navy", "Blue"], "Atlanta Falcons": ["Red", "Black"],
  "Carolina Panthers": ["Blue", "Black"], "New Orleans Saints": ["Gold", "Black"], "Arizona Cardinals": ["Red", "White"], "Washington Commanders": ["Burgundy", "Gold"],
};
