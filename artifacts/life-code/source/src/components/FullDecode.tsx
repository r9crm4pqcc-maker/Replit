import { useState } from "react";
import { useOverrides, setOverride, clearOverride, entityKey } from "@/lib/date-overrides";
import { readEntity, gameEnergies, show, monthName, recordRoot, sideScore, type CycleRead, type Tri } from "@/lib/full-decode";

export interface DecodeEntity { kind: "team" | "player" | "city" | "stadium"; side: "home" | "away" | "venue"; name: string; role?: string; date?: Tri; jersey?: string; record?: string }

const fmtDate = (t: Tri) => `${monthName(t[1])} ${t[2]}, ${t[0]}`;
export const parseDob = (s?: string): Tri | undefined => { const m = s?.match(/^(\d{4})-(\d{2})-(\d{2})/); return m ? [+m[1], +m[2], +m[3]] : undefined; };

function lines(e: DecodeEntity, r: CycleRead | null): string[] {
  if (!r) return ["Birth / founding date not available yet — decode for this entry cannot run."];
  const out: string[] = [];
  if (e.kind !== "player" && e.kind !== "city") out.push(`Founding Date: ${fmtDate(r.date)}`);
  if (e.kind === "player" || e.kind === "city") out.push(`${e.kind === "city" ? "Incorporated" : "Born"}: ${fmtDate(r.date)}`);
  out.push(`Lifepath: ${show(r.lp)}`, `Secondary Energy: ${show(r.secondary)}`,
    `Day Of The Year: ${r.doy} (root ${r.doyRoot})`, `Week Of The Year: ${r.woy} (root ${r.woyRoot})`);
  if (e.kind === "team" || e.kind === "stadium") out.push(`Lunar Cycle: ${r.moon.label}`);
  out.push(`Personal Year Cycle: ${show(r.py)}`, `Personal Month Cycle: ${show(r.pm)}`, `Personal Day Cycle: ${show(r.pd)}`, `Personal Week Cycle: ${show(r.pw)}`,
    `Personal Hour Cycle: ${r.ph[0]} at start → ${r.ph[1]} mid-game → ${r.ph[2]} closing (closing weighted highest)`,
    `Chinese Zodiac Year: ${r.yearP}`, `Chinese Zodiac Month: ${r.monthP}`, `Chinese Zodiac Day: ${r.dayP}`,
    `Lucky Number: ${r.lucky} (root ${r.luckyRoot})`);
  if (e.kind === "player") out.push(`Jersey Number: ${e.jersey ?? "not in feed"}${e.jersey && +e.jersey === r.lucky ? " — matches Lucky Number" : ""}`);
  if (e.kind === "team") { const rr = recordRoot(e.record); out.push(`Current Record: ${e.record ?? "not in feed"}${rr ? ` (${rr} vibration)` : ""}`); }
  out.push(`Birth Card: ${r.matrix.card}`, `Fatal Attraction Dates: ${r.matrix.fatal.join(", ")}`, `Challenging / Rival Dates: ${r.matrix.challenging.join(", ")}`,
    `Soulmate Dates: ${r.matrix.soulmate.join(", ") || "—"}`, `Beneficial Dates: ${r.matrix.beneficial.join(", ")}`);
  r.matrix.today.forEach(t => out.push(`⚡ TONIGHT: ${t}`));
  return out;
}

export function computeFullDecode(raw: DecodeEntity[], game: Tri, kickoffHour: number, ov: Record<string, { date?: string; jersey?: string }> = {}) {
  const entities = raw.map(e => { const o = ov[entityKey(e.kind, e.name)]; return o ? { ...e, date: parseDob(o.date) ?? e.date, jersey: o.jersey || e.jersey, edited: true } : e; });
  const ge = gameEnergies(game, kickoffHour);
  const reads = entities.map(e => ({ e, r: e.date ? readEntity(e.date, game, kickoffHour, e.kind === "team") : null }));
  let home = 0, away = 0;
  for (const { e, r } of reads) {
    if (!r) continue;
    const w = e.kind === "team" ? 1 : e.kind === "player" ? 0.5 : 0.25;
    const s = sideScore(r, ge.lp.reduced, w);
    if (e.side === "away") away += s; else home += s;
  }
  return { ge, reads, home, away };
}

export function FullDecode({ title, data, homeName, awayName, verdict }: { title: string; data: ReturnType<typeof computeFullDecode>; homeName: string; awayName: string; verdict: string }) {
  const [copied, setCopied] = useState(false);
  const [editing, setEditing] = useState(false);
  const { ge, reads } = data;
  const gameLines = [`Lifepath: ${show(ge.lp)}`, `Secondary Energy: ${show(ge.secondary)}`, `Day Of The Year: ${ge.doy} (root ${ge.doyRoot})`,
    `Week Of The Year: ${ge.woy} (root ${ge.woyRoot})`, `Lunar Cycle: ${ge.moon.label}`, `Chinese Zodiac Year: ${ge.yearP}`,
    `Chinese Zodiac Month: ${ge.monthP}`, `Chinese Zodiac Day: ${ge.dayP}`, `Chinese Zodiac Hour: ${ge.hourP[0]} → ${ge.hourP[1]}`];
  const group = (k: DecodeEntity["kind"]) => reads.filter(x => x.e.kind === k);
  const sections: [string, typeof reads][] = [["PART 2 · THE TEAMS", group("team")], ["PART 3 · KEY PLAYERS", group("player")], ["PART 4 · THE CITY", group("city")], ["PART 5 · THE STADIUM", group("stadium")]];
  const head = (x: (typeof reads)[number]) => `${(x.e as { edited?: boolean }).edited ? "✎ " : ""}${x.e.side === "away" ? "AWAY · " : x.e.side === "home" ? "HOME · " : ""}${x.e.name}${x.e.role ? ` (${x.e.role})` : ""}`;
  const copy = () => {
    const txt = [title, "", "PART 1 · GAME ENERGIES", ...gameLines.map(l => `• ${l}`),
      ...sections.flatMap(([t, xs]) => ["", t, ...xs.flatMap(x => ["", head(x), ...lines(x.e, x.r).map(l => `• ${l}`)])]),
      "", "SYSTEMIC VERDICT", verdict].join("\n");
    navigator.clipboard?.writeText(txt).then(() => { setCopied(true); setTimeout(() => setCopied(false), 1500); });
  };
  return (
    <div className="mb-4 rounded-lg border border-border">
      <div className="flex items-center justify-between gap-2 px-3 py-2 bg-muted/40">
        <p className="text-[10px] font-bold tracking-[0.18em] text-primary">FULL DECODE · 5 PARTS</p>
        <div className="flex gap-1"><button onClick={() => setEditing(v => !v)} className="text-[10px] font-bold px-2 py-1 rounded border border-primary text-primary">{editing ? "DONE" : "EDIT DATES"}</button>
        <button onClick={copy} className="text-[10px] font-bold px-2 py-1 rounded bg-primary text-primary-foreground">{copied ? "COPIED" : "COPY DECODE"}</button></div>
      </div>
      <div className="p-3 space-y-3 text-[11px]">
        {editing && <DateEditor entities={reads.map(x => x.e)} />}
        <Block title="PART 1 · GAME ENERGIES" items={gameLines} />
        {sections.map(([t, xs]) => (
          <div key={t}>
            <p className="text-[10px] font-bold tracking-[0.16em] text-primary mb-1">{t}</p>
            {xs.length === 0 ? <p className="text-muted-foreground">Not in the feed for this game.</p> :
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {xs.map((x, i) => <Block key={i} title={head(x)} items={lines(x.e, x.r)} />)}
              </div>}
          </div>
        ))}
        <div className="rounded-md bg-primary/10 border border-primary/30 p-2">
          <p className="text-[10px] font-bold tracking-[0.16em] text-primary mb-1">SYSTEMIC VERDICT</p>
          <p className="text-foreground">{verdict}</p>
          <p className="text-muted-foreground mt-1">{awayName} {Math.round((100 * data.away) / ((data.away + data.home) || 1))}% · {homeName} {Math.round((100 * data.home) / ((data.away + data.home) || 1))}%</p>
        </div>
      </div>
    </div>
  );
}

function Block({ title, items }: { title: string; items: string[] }) {
  return (
    <div className="rounded-md bg-muted/30 p-2">
      <p className="font-bold text-foreground mb-1">{title}</p>
      <ul className="space-y-0.5">{items.map((l, i) => <li key={i} className={l.startsWith("⚡") ? "text-primary font-semibold" : "text-muted-foreground"}>• {l}</li>)}</ul>
    </div>
  );
}

const iso = (t?: Tri) => (t ? `${t[0]}-${String(t[1]).padStart(2, "0")}-${String(t[2]).padStart(2, "0")}` : "");
function DateEditor({ entities }: { entities: DecodeEntity[] }) {
  const ov = useOverrides();
  return (
    <div className="rounded-md border border-primary/40 p-2 space-y-1">
      <p className="text-[10px] font-bold tracking-[0.16em] text-primary">Dates · saved on this device</p>
      {entities.map(e => {
        const k = entityKey(e.kind, e.name); const o = ov[k];
        return (
          <div key={k} className="flex flex-wrap items-center gap-2">
            <span className="w-48 truncate text-foreground">{e.name} <span className="text-muted-foreground">({e.role ?? e.kind})</span></span>
            <input type="date" defaultValue={o?.date ?? iso(e.date)} onBlur={ev => ev.target.value && setOverride(k, { date: ev.target.value })} className="bg-background border border-border rounded px-1 py-0.5" />
            {e.kind === "player" && <input placeholder="Jersey" defaultValue={o?.jersey ?? e.jersey ?? ""} onBlur={ev => setOverride(k, { jersey: ev.target.value })} className="w-16 bg-background border border-border rounded px-1 py-0.5" />}
            {!e.date && !o && <span className="text-destructive font-semibold">MISSING</span>}
            {o && <><span className="text-primary font-semibold">EDITED</span><button onClick={() => clearOverride(k)} className="underline text-muted-foreground">reset</button></>}
          </div>
        );
      })}
    </div>
  );
}

/** Page-level toolbox: every saved edit, across all sports. */
export function SavedEdits() {
  const ov = useOverrides(); const [open, setOpen] = useState(false); const keys = Object.keys(ov);
  return (
    <div className="mb-4">
      <button onClick={() => setOpen(v => !v)} className="text-xs font-bold px-3 py-1.5 rounded bg-primary text-primary-foreground">DATE TOOLBOX · {keys.length} saved edits</button>
      {open && <div className="mt-2 rounded-lg border border-border p-3 text-[11px] space-y-1">
        <p className="text-muted-foreground">Pick a sport, then press EDIT DATES on any game to change a team, player, coach, city or stadium date. Edits here apply to all future games.</p>
        {keys.length === 0 ? <p className="text-muted-foreground">No edits yet.</p> : keys.map(k => (
          <div key={k} className="flex flex-wrap items-center gap-2">
            <span className="w-56 truncate text-foreground">{k.replace(":", " · ")}</span>
            <input type="date" defaultValue={ov[k].date ?? ""} onBlur={ev => ev.target.value && setOverride(k, { date: ev.target.value })} className="bg-background border border-border rounded px-1 py-0.5" />
            {ov[k].jersey && <span className="text-muted-foreground">#{ov[k].jersey}</span>}
            <button onClick={() => clearOverride(k)} className="underline text-muted-foreground">remove</button>
          </div>))}
      </div>}
    </div>
  );
}
