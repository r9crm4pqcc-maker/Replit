// Standalone four-cipher gematria for a game.
// Ordinal, Reduction, Reverse, Reverse Reduction.
// Scored on its own. Never added to the vote or the full decode.

export interface FourCiphers {
  ordinal: number;
  reduction: number;
  reverse: number;
  reverseReduction: number;
}

export type CipherKind = keyof FourCiphers;

export const CIPHER_KINDS: CipherKind[] = ["ordinal", "reduction", "reverse", "reverseReduction"];

export const CIPHER_LABEL: Record<CipherKind, string> = {
  ordinal: "Ordinal",
  reduction: "Reduction",
  reverse: "Reverse",
  reverseReduction: "Reverse Reduction",
};

const lettersOf = (text: string) =>
  text.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toUpperCase().replace(/[^A-Z]/g, "");

export function digitalRoot(n: number): number {
  let x = Math.abs(Math.trunc(n));
  if (x === 0) return 0;
  while (x > 9) x = String(x).split("").reduce((a, c) => a + Number(c), 0);
  return x;
}

/** A=1…Z=26 full sum, that sum reduced, Z=1…A=26 full sum, that sum reduced. */
export function fourCiphers(text: string): FourCiphers {
  let ordinal = 0;
  let reverse = 0;
  for (const ch of lettersOf(text)) {
    const o = ch.charCodeAt(0) - 64;
    ordinal += o;
    reverse += 27 - o;
  }
  return {
    ordinal,
    reduction: digitalRoot(ordinal),
    reverse,
    reverseReduction: digitalRoot(reverse),
  };
}

export function cipherLine(c: FourCiphers): string {
  return CIPHER_KINDS.map((k) => `${CIPHER_LABEL[k]} ${c[k]}`).join(" / ");
}

export interface NamedCipher {
  role: string;
  name: string;
  ciphers: FourCiphers;
}

type TargetKind = "streak" | "series" | "date" | "jersey" | "score" | "season";

interface Target {
  n: number;
  kind: TargetKind;
  label: string;
}

const RANK: Record<TargetKind, number> = { streak: 4, series: 3, date: 2, jersey: 1, score: 1, season: 1 };
const POINTS: Record<TargetKind, number> = { streak: 2, series: 2, date: 1, jersey: 1, score: 1, season: 1 };

export interface GematriaPerson {
  role: string;
  name: string;
}

export interface GematriaSideInput {
  team: string;
  people?: GematriaPerson[];
  /** Host city and stadium. Scored on this side only. */
  venue?: GematriaPerson[];
  winStreak?: number;
  loseStreak?: number;
  seriesWins?: number;
  h2hWins?: number;
  seasonWins?: number;
  seasonLosses?: number;
  jerseys?: number[];
}

export interface GematriaInput {
  awayName: string;
  homeName: string;
  away: GematriaSideInput;
  home: GematriaSideInput;
  month: number;
  day: number;
  /** Previous meeting scores and margins. Both sides can hit these. */
  priorNumbers?: number[];
  /** Series digits we could not assign to a side. Both sides can hit these. */
  sharedSeries?: number[];
}

interface Hit {
  text: string;
  kind: CipherKind;
  n: number;
  points: number;
  targetKind: TargetKind;
}

export interface GematriaSideRead {
  team: string;
  names: NamedCipher[];
  hits: string[];
  score: number;
  streakOrH2h: boolean;
  parts: string;
}

export interface GematriaDecode {
  title: string;
  dateLabel: string;
  away: GematriaSideRead;
  home: GematriaSideRead;
  clash: boolean;
  clashNote: string;
  edge: string;
  decision: string;
  ignored: boolean;
}

function pos(n: number | undefined): number | undefined {
  if (n == null || !Number.isFinite(n) || n <= 0) return undefined;
  return Math.trunc(n);
}

function addTarget(list: Target[], n: number | undefined, kind: TargetKind, label: string) {
  const v = pos(n);
  if (v == null) return;
  if (list.some((t) => t.n === v && t.kind === kind && t.label === label)) return;
  list.push({ n: v, kind, label });
}

function targetsFor(side: GematriaSideInput, month: number, day: number, prior: number[], sharedSeries: number[]): Target[] {
  const list: Target[] = [];
  addTarget(list, side.winStreak, "streak", `win streak ${side.winStreak}`);
  addTarget(list, side.loseStreak, "streak", `losing streak ${side.loseStreak}`);
  addTarget(list, side.seriesWins, "series", `series wins ${side.seriesWins}`);
  addTarget(list, side.h2hWins, "series", `H2H wins ${side.h2hWins}`);
  for (const n of sharedSeries) addTarget(list, n, "series", `series record ${n}`);
  const sum = month + day;
  const reduced = digitalRoot(sum);
  addTarget(list, sum, "date", `month + day ${sum}`);
  if (reduced !== sum) addTarget(list, reduced, "date", `reduced date ${reduced}`);
  for (const j of side.jerseys ?? []) addTarget(list, j, "jersey", `jersey ${j}`);
  for (const n of prior) addTarget(list, n, "score", `previous score or margin ${n}`);
  addTarget(list, side.seasonWins, "season", `season wins ${side.seasonWins}`);
  addTarget(list, side.seasonLosses, "season", `season losses ${side.seasonLosses}`);
  return list;
}

function usableName(name: string): boolean {
  const t = name.trim();
  if (lettersOf(t).length < 2) return false;
  if (/not posted|not in feed|tbd|starter$|coach$/i.test(t)) return false;
  return true;
}

function namesOf(side: GematriaSideInput): NamedCipher[] {
  const rows: NamedCipher[] = [];
  const push = (role: string, name?: string) => {
    if (!name || !usableName(name)) return;
    if (rows.some((r) => r.role === role && r.name === name)) return;
    rows.push({ role, name, ciphers: fourCiphers(name) });
  };
  push("Team", side.team);
  for (const p of side.people ?? []) push(p.role, p.name);
  for (const p of side.venue ?? []) push(p.role, p.name);
  return rows;
}

function readSide(side: GematriaSideInput, targets: Target[]): GematriaSideRead {
  const names = namesOf(side);
  const hits: Hit[] = [];
  for (const row of names) {
    for (const kind of CIPHER_KINDS) {
      const n = row.ciphers[kind];
      if (n <= 0) continue;
      const matched = targets.filter((t) => t.n === n);
      if (!matched.length) continue;
      const best = matched.reduce((a, b) => (RANK[b.kind] > RANK[a.kind] ? b : a));
      const why = matched.map((t) => t.label).join(" and ");
      hits.push({
        text: `${row.role} ${CIPHER_LABEL[kind]} ${n} = ${why}`,
        kind,
        n,
        points: POINTS[best.kind],
        targetKind: best.kind,
      });
    }
  }
  let score = hits.reduce((a, h) => a + h.points, 0);
  const parts: string[] = [];
  if (hits.length) parts.push(`hits +${hits.reduce((a, h) => a + h.points, 0)}`);
  const byNumber = new Map<number, number>();
  for (const h of hits) byNumber.set(h.n, (byNumber.get(h.n) ?? 0) + 1);
  const stacked = [...byNumber.entries()].filter(([, c]) => c > 1).map(([n]) => n);
  if (stacked.length) {
    score += 1;
    parts.push(`same-number bonus +1 (${stacked.join(", ")})`);
  }
  const reverseHits = hits.filter((h) => h.kind === "reverse" || h.kind === "reverseReduction").length;
  const forwardHits = hits.filter((h) => h.kind === "ordinal" || h.kind === "reduction").length;
  if (reverseHits > forwardHits) {
    score += 1;
    parts.push("reverse side has more hits +1");
  }
  return {
    team: side.team,
    names,
    hits: hits.map((h) => h.text),
    score,
    streakOrH2h: hits.some((h) => h.targetKind === "streak" || h.targetKind === "series"),
    parts: parts.join(" · ") || "no hits",
  };
}

function fullSums(side: GematriaSideRead): number[] {
  const nums: number[] = [];
  for (const row of side.names) {
    if (row.ciphers.ordinal > 9) nums.push(row.ciphers.ordinal);
    if (row.ciphers.reverse > 9) nums.push(row.ciphers.reverse);
  }
  return nums;
}

export function gematriaDecode(input: GematriaInput): GematriaDecode {
  const prior = (input.priorNumbers ?? []).filter((n) => n > 0);
  const shared = (input.sharedSeries ?? []).filter((n) => n > 0);
  const away = readSide(input.away, targetsFor(input.away, input.month, input.day, prior, shared));
  const home = readSide(input.home, targetsFor(input.home, input.month, input.day, prior, shared));

  const awaySums = new Set(fullSums(away));
  const clashes = fullSums(home).filter((n) => awaySums.has(n));
  const clash = clashes.length > 0;
  if (clash) {
    away.score -= 1;
    home.score -= 1;
    away.parts += " · clash -1";
    home.parts += " · clash -1";
  }

  const sum = input.month + input.day;
  const dateLabel = `Date reduced (month + day) ${input.month}+${input.day} = ${sum}${digitalRoot(sum) === sum ? "" : ` → ${digitalRoot(sum)}`}`;
  const diff = away.score - home.score;
  const ignored = clash || diff === 0;
  let edge = "Even";
  let decision = clash ? "Layer ignored — direct cipher clash." : "Layer ignored — even.";
  if (!ignored) {
    const leader = diff > 0 ? away : home;
    const name = diff > 0 ? input.awayName : input.homeName;
    edge = `${name} +${Math.abs(diff)}`;
    decision = leader.streakOrH2h
      ? `Stronger lean ${name}. A streak or series / H2H number hit.`
      : `Lean ${name}.`;
  }
  return {
    title: `Gematria Decode – ${input.awayName} vs ${input.homeName}`,
    dateLabel,
    away,
    home,
    clash,
    clashNote: clash
      ? `Yes — full total ${[...new Set(clashes)].join(", ")} sits on both sides`
      : "No",
    edge,
    decision: `${decision} Standalone only — not mixed with the pick above.`,
    ignored,
  };
}
