import { describe, expect, it } from "vitest";
import { DEFAULT_PROFILE, animalLabel, buildChart, listDates, nameReading, openOn, pricesToEight, readDay, scoreGoal } from "./life-studio";

describe("life studio", () => {
  it("keeps the default life path at 28/1", () => {
    const chart = buildChart(DEFAULT_PROFILE, { y: 2026, m: 11, d: 4 });
    expect(chart.lifePath).toEqual({ compound: 28, reduced: 1 });
    expect(chart.yearAnimal).toBe("Ox");
    expect(chart.birthMonthAnimal).toBe("Rooster");
    expect(chart.birthPersonalMonth.reduced).toBe(9);
    expect(chart.dayAnimal).toBe("Cat");
    expect(chart.hour).toBe("Snake");
    expect(chart.hours.filter((h) => h.enemy).map((h) => h.sign)).toEqual(["Pig"]);
    expect(chart.hours.find((h) => h.sign === "Cat")?.enemy).toBe(false);
    expect(animalLabel("Cat")).toBe("Cat");
    expect(animalLabel("Rabbit")).toBe("Cat");
    expect(chart.months.find((m) => m.month === 3)?.enemy).toBe(true);
    expect(chart.months.find((m) => m.month === 3)?.sun).toBe("Pisces");
    expect(chart.months.find((m) => m.month === 1)?.earth).toBe("friend");
    expect(chart.months.find((m) => m.month === 5)?.west).toBe("friend");
    expect(chart.months.find((m) => m.month === 7)?.enemy).toBe(false);
    expect(chart.hourStandard).toBe("10:18");
    expect(chart.lucky).toEqual([99, 98, 28, 8]);
    expect(chart.sun).toBe("Virgo");
  });

  it("reads a day with a do and an avoid", () => {
    const day = readDay(DEFAULT_PROFILE, 2026, 11, 4);
    expect(day.headline).toMatch(/Universal/);
    expect(day.headline).toMatch(/Together/);
    expect(day.headline).not.toMatch(/[Pp]ersonal/);
    expect(day.reading).not.toMatch(/[Pp]ersonal day/);
    expect(day.dos.length).toBeGreaterThan(0);
    expect(day.avoids.length).toBeGreaterThan(0);
  });

  it("lists soulmate dates and scores a goal", () => {
    const soul = listDates(DEFAULT_PROFILE, "soulmate", 2026);
    expect(soul.length).toBeGreaterThan(0);
    const scored = scoreGoal(DEFAULT_PROFILE, 2026, 8, 8, "money");
    expect(scored.score).toBeGreaterThanOrEqual(0);
    expect(scored.score).toBeLessThanOrEqual(10);
  });

  it("reads the whole name and opens cleats on marked days only", () => {
    const name = nameReading(DEFAULT_PROFILE);
    expect(name.root).toBe(3);
    expect(name.reducedCompound).toBe(57);
    expect(name.fullCompound).toBe(156);
    expect(name.vowels).toBe(22);
    expect(name.first).toEqual({ letter: "C", n: 3 });
    expect(name.firstVowel).toEqual({ letter: "I", n: 9 });
    const opened = openOn(DEFAULT_PROFILE, "cleats", { y: 2026, m: 11, d: 4 });
    expect(opened.hits.length).toBeGreaterThan(0);
    expect(opened.hits.every((h) => /Love|Soulmate|Wealth|Beneficial/.test(h.why))).toBe(true);
    expect(pricesToEight(80).every((n) => String(n).split("").reduce((a, d) => a + +d, 0) % 9 === 8 || n === 8)).toBe(true);
  });
});
