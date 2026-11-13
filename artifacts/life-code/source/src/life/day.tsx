import { Link } from "@/lib/wouter";
import { useParams } from "@/lib/wouter";
import { useLife } from "./context";
import { Card, Page, Stat, Tag } from "./kit";
import { LIST_LABEL, parseIso, readDay, seasonOf, buildChart, type BirthProfile } from "@/lib/life-studio";
import { DAY_28_ON_7, cueDayBand, cueDayPercent, dayCompatibility, isPath28 } from "@/lib/path28";

export function DayFit({ profile, y, m, d }: { profile: BirthProfile; y: number; m: number; d: number }) {
  const read = readDay(profile, y, m, d);
  const chart = buildChart(profile, { y, m, d });
  const fit = dayCompatibility({
    lifeCompound: chart.lifePath.compound,
    lifeReduced: chart.lifePath.reduced,
    universalReduced: read.universal.reduced,
    universalCompound: read.universal.compound,
    dayReduced: read.calendar.reduced,
    dayCompound: read.calendar.compound,
    combinedReduced: read.combined.reduced,
    combinedCompound: read.combined.compound,
    yearAnimal: chart.yearAnimal,
    monthAnimal: read.monthAnimal,
    sun: chart.sun,
    daySun: read.sun,
  });
  const week = Array.from({ length: 7 }, (_, i) => {
    const dt = new Date(Date.UTC(y, m - 1, d + i));
    const ny = dt.getUTCFullYear();
    const nm = dt.getUTCMonth() + 1;
    const nd = dt.getUTCDate();
    const r = readDay(profile, ny, nm, nd);
    const c = buildChart(profile, { y: ny, m: nm, d: nd });
    const f = dayCompatibility({
      lifeCompound: c.lifePath.compound,
      lifeReduced: c.lifePath.reduced,
      universalReduced: r.universal.reduced,
      universalCompound: r.universal.compound,
      dayReduced: r.calendar.reduced,
      dayCompound: r.calendar.compound,
      combinedReduced: r.combined.reduced,
      combinedCompound: r.combined.compound,
      yearAnimal: c.yearAnimal,
      monthAnimal: r.monthAnimal,
      sun: c.sun,
      daySun: r.sun,
    });
    return { nd, pct: f.numbers[1]?.pct };
  });
  const cue = cueDayPercent(y, m, d);
  return (
    <Card>
      <p className="text-xs uppercase tracking-wide text-muted-foreground">Compatibility with this day</p>
      <p className="font-display text-3xl text-foreground">{cue}% · {cueDayBand(cue)}</p>
      <p className="text-sm text-muted-foreground">Life path {fit.self} and the day {fit.numbers[1]?.other} are {fit.numbers[1]?.rel}{fit.numbers[1]?.pct != null ? ` · ${fit.numbers[1].pct}%` : ""}.</p>
      <p className="text-sm text-foreground mt-2">
        {fit.numbers.filter((n) => n.name !== "Together").map((n) => `${n.name} ${n.other} ${n.pct != null ? `${n.pct}%` : n.rel}`).join(" · ")}
        {fit.numberPct != null ? ` · number fit ${fit.numberPct}%` : ""}
      </p>
      <p className="text-sm text-muted-foreground mt-1">
        Chinese zodiac: {chart.yearAnimal} with {read.monthAnimal} month {fit.month}% · Western sun: {chart.sun} with {read.sun} {fit.sky}%
      </p>
      <p className="text-xs text-muted-foreground mt-3">Next days, life path against the calendar day</p>
      <p className="text-sm text-foreground">{week.map((w) => `${w.nd} ${w.pct != null ? `${w.pct}%` : "—"}`).join(" · ")}</p>
    </Card>
  );
}

function SeventhFor28() {
  const layers = [DAY_28_ON_7.life, DAY_28_ON_7.day];
  return (
    <>
      {layers.map((layer) => (
        <Card key={layer.kicker}>
          <p className="text-xs uppercase tracking-wide text-muted-foreground">{layer.kicker}</p>
          <h2 className="font-display text-lg">{layer.title}</h2>
          <p className="text-sm text-foreground/90 mt-2">{layer.body}</p>
          <p className="text-sm mt-2">Do: {layer.good.join(" · ")}</p>
          <p className="text-sm text-muted-foreground">Watch: {layer.watch.join(" · ")}</p>
        </Card>
      ))}
      <Card>
        <p className="text-xs uppercase tracking-wide text-muted-foreground">{DAY_28_ON_7.combo.kicker}</p>
        <h2 className="font-display text-lg">{DAY_28_ON_7.combo.title}</h2>
        <p className="text-sm text-foreground/90 mt-2">{DAY_28_ON_7.combo.body}</p>
        <p className="text-sm mt-2">{DAY_28_ON_7.combo.positive}</p>
        <p className="text-sm text-muted-foreground mt-2">{DAY_28_ON_7.combo.negative}</p>
        <p className="text-sm text-foreground/90 mt-2">{DAY_28_ON_7.combo.forecast}</p>
        <p className="text-sm text-muted-foreground mt-2">{DAY_28_ON_7.combo.use.join(" · ")}</p>
      </Card>
    </>
  );
}

export default function DayPage() {
  const { sub } = useParams();
  const { profile } = useLife();
  const parsed = sub ? parseIso(sub) : null;
  if (!parsed) {
    return <Page kicker="Date" title="That date is not valid" lede="Use a real calendar day."><Link href="/dates" className="text-sm text-primary">Back to the library</Link></Page>;
  }
  const read = readDay(profile, parsed.y, parsed.m, parsed.d);
  const path28 = isPath28(buildChart(profile, parsed).lifePath.compound);
  const seventh = path28 && read.d === 7;
  return (
    <Page kicker={read.weekday} title={`${read.m}/${read.d}/${read.y}`} lede={read.headline.replace(/^Today is /, "This is ")}>
      <div className="flex flex-wrap gap-2">
        {read.tones.map((t) => <Tag key={t} tone={t === "fatal" || t === "challenging" ? "bad" : "good"}>{LIST_LABEL[t]}</Tag>)}
        {read.flags.map((f) => <Tag key={f}>{f}</Tag>)}
        <Tag tone={read.earth === "enemy" ? "bad" : read.earth === "friend" ? "good" : "neutral"}>Earth {read.earth}</Tag>
        <Tag tone={read.west === "enemy" ? "bad" : read.west === "friend" ? "good" : "neutral"}>Western {read.west}</Tag>
        <Tag>Number {read.number}</Tag>
      </div>
      <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-3">
        <Stat label="Universal" value={read.labelU} hint={read.universalLine} />
        <Stat label="Day" value={read.labelDay} hint={read.dayLine} />
        <Stat label="Together" value={read.labelCombined} hint={read.combinedLine} />
        <Stat label="Sky" value={read.sun} hint={`${seasonOf(read.m, read.d)} · moon ${read.moonSign} · ${read.moon}`} />
      </div>
      <DayFit profile={profile} y={read.y} m={read.m} d={read.d} />
      <Card>
        <h2 className="font-display text-lg mb-2">Universal</h2>
        <p className="text-sm leading-relaxed text-foreground/90">{read.universalLine}</p>
        <h2 className="font-display text-lg mt-4 mb-2">The day</h2>
        <p className="text-sm leading-relaxed text-foreground/90">{read.dayLine}</p>
        <h2 className="font-display text-lg mt-4 mb-2">Together</h2>
        <p className="text-sm leading-relaxed text-foreground/90">{read.combinedLine}</p>
        <ul className="mt-3 space-y-1 text-sm text-muted-foreground">{read.notes.map((n) => <li key={n}>{n}</li>)}</ul>
      </Card>
      <div className="grid sm:grid-cols-2 gap-3">
        <Card>
          <h2 className="font-display text-lg text-primary mb-2">Do</h2>
          <ul className="space-y-2 text-sm text-foreground/90">{read.dos.map((x) => <li key={x}>{x}</li>)}</ul>
        </Card>
        <Card>
          <h2 className="font-display text-lg text-destructive mb-2">Avoid</h2>
          <ul className="space-y-2 text-sm text-foreground/90">{read.avoids.map((x) => <li key={x}>{x}</li>)}</ul>
        </Card>
      </div>
      {seventh && <SeventhFor28 />}
      <Link href="/dates" className="text-sm text-primary">All date lists</Link>
    </Page>
  );
}
