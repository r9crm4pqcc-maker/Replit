import { colorNumbers, colorFit, compat } from "./gg33";
import { describe, it, expect } from "vitest";
import { signRelation, chineseSign, chineseMonthSign, colorNum, isWorstPair, numberRelation, runVotes, lifePath, foundingPath, championshipAlerts, secretRelation } from "./vote-decode";

describe("vote decoder rules", () => {
  it("trine signs are friends", () => expect(signRelation("Rat", "Monkey")).toBe("friend"));
  it("clash pairs are enemies", () => expect(signRelation("Cat", "Rooster")).toBe("enemy"));
  it("2026 Horse year: Rat is in its enemy year", () => {
    expect(chineseSign(2026)).toBe("Horse");
    expect(signRelation("Rat", "Horse")).toBe("enemy");
  });
  it("animal months: 6th to the 5th, Tiger starts Feb 4", () => {
    expect(chineseMonthSign(10, 8)).toBe("Dog");
    expect(chineseMonthSign(10, 5)).toBe("Rooster");
    expect(chineseMonthSign(2, 3)).toBe("Ox");
    expect(chineseMonthSign(2, 4)).toBe("Tiger");
    expect(chineseMonthSign(3, 5)).toBe("Tiger");
    expect(chineseMonthSign(3, 6)).toBe("Cat");
    expect(chineseMonthSign(12, 5)).toBe("Pig");
    expect(chineseMonthSign(12, 6)).toBe("Rat");
    expect(chineseMonthSign(11, 6)).toBe("Pig");
  });
  it("number pairs", () => {
    expect(numberRelation(1, 9)).toBe("worst");
    expect(numberRelation(3, 4)).toBe("enemy");
    expect(numberRelation(7, 11)).toBe("soulmate");
    expect(numberRelation(3, 5)).toBe("friend");
  });
  it("GG33 color map", () => {
    expect(colorNumbers("Red")).toEqual([3, 5, 9]); expect(colorNumbers("Blue")).toEqual([4]);
    expect(colorNumbers("Light Blue")).toEqual([22]); expect(colorNumbers("Orange")).toEqual([6, 33]);
  });
  it("no red on a 1 day (1 & 9 enemies), white fits a 1 day", () => {
    expect(colorFit("Red", 1)).toBe(-1); expect(colorFit("White", 1)).toBe(1);
  });
  it("GG33 chart: 4 & 5 enemies, 7 & 11 friendly", () => {
    expect(compat(4, 5).rel).toBe("enemy"); expect(compat(7, 11)).toEqual({ rel: "friendly", pct: 99 });
    expect(numberRelation(6, 7)).toBe("enemy");
  });
  it("1 vs 9 is the worst-enemy pair", () => expect(isWorstPair(1, 9)).toBe(true));
  it("Cowboys 1/28/1960 = 27/9", () => expect(lifePath(1960, 1, 28)).toEqual({ compound: 27, reduced: 9 }));
  it("Cue founding dates: Lakers 11/1/1947 = 33 Pig, Thunder 9/3/2008 = 22 Rat", () => {
    expect(foundingPath(1947, 11, 1)).toEqual({ compound: 33, reduced: 33 });
    expect(chineseSign(1947)).toBe("Pig");
    expect(foundingPath(2008, 9, 3)).toEqual({ compound: 22, reduced: 22 });
    expect(chineseSign(2008)).toBe("Rat");
  });
  it("9 Universal Day = no play", () => {
    // 2026-10-10: 1+0+1+0+2+0+2+6 = 12/3; 2026-10-15 = 1+0+1+5+2+0+2+6=17/8; 2026-10-16 = 18/9
    const r = runVotes({ year: 2026, month: 10, day: 16, home: { name: "H", people: [] }, away: { name: "A", people: [] } });
    expect(r.noPlay).toBe(true);
  });
  it("keeps Chinese zodiac day-animal fields out of sports decode output", () => {
    const r = runVotes({
      year: 2026,
      month: 10,
      day: 8,
      home: { name: "H", people: [] },
      away: { name: "A", people: [] },
    });
    expect(r).not.toHaveProperty("gameDaySign");
    expect(r.entities.some((entity) => "daySign" in entity)).toBe(false);
  });
  it("example: Bucs over Cowboys on 10/8/2026 (1 & 8 day)", () => {
    const r = runVotes({ year: 2026, month: 10, day: 8, league: "NFL",
      home: { name: "Dallas Cowboys", founded: [1960, 1, 28], colors: ["Navy", "Silver"], people: [] },
      away: { name: "Tampa Bay Buccaneers", founded: [1974, 4, 24], colors: ["Red", "Pewter"], people: [] } });
    expect(r.reads.home.enemyYear).toBe(true);
    expect(r.votes.some((v) => /Team rating/.test(v.reason))).toBe(true);
  });
  it("colors and records only break ties", () => {
    const base = { year: 2026, month: 10, day: 8, home: { name: "H", people: [], record: "10-90" }, away: { name: "A", people: [], record: "90-10" } };
    const r = runVotes(base);
    expect(r.tiebreak).toBe(true);
    expect(r.pick).toBe("away");
    expect(r.flags.colorHome).toBe(0);
    expect(r.flags.colorAway).toBe(0);
  });
  it("colorology caps at 2 and punishes red on a 9 day", () => {
    const r = runVotes({ year: 2026, month: 10, day: 16,
      home: { name: "H", people: [], colors: ["Blue"] },
      away: { name: "A", people: [], colors: ["Red"] } });
    expect(r.flags.colorHome).toBeGreaterThan(0);
    expect(r.flags.colorHome).toBeLessThanOrEqual(2);
    expect(r.flags.colorAway).toBeLessThanOrEqual(2);
    expect(r.votes.some(v => v.layer === "Colors" && /enemy color/.test(v.reason))).toBe(true);
  });
  it("both dangerous colors on a 9 day flag the under", () => {
    const r = runVotes({ year: 2026, month: 10, day: 16,
      home: { name: "H", people: [], colors: ["Black"] },
      away: { name: "A", people: [], colors: ["Red"] } });
    expect(r.flags.volatility).toMatch(/under/i);
  });
  it("a 9-vibration record is penalized on a 9 day", () => {
    const r = runVotes({ year: 2026, month: 10, day: 16,
      home: { name: "H", founded: [2000, 1, 1], record: "8-1", people: [] },
      away: { name: "A", founded: [2000, 1, 2], record: "5-3", people: [] } });
    expect(r.flags.record9.some(x => x.startsWith("H"))).toBe(true);
    expect(r.votes.some(v => v.layer === "Records" && v.side === "away" && /vibrates at 9/.test(v.reason))).toBe(true);
  });
  it("master life path multiplies only the side that has it", () => {
    const r = runVotes({ year: 2026, month: 10, day: 8,
      home: { name: "Masters", founded: [1991, 1, 1], people: [] },
      away: { name: "Plain", founded: [2000, 1, 1], people: [] } });
    expect(lifePath(1991, 1, 1).compound).toBe(22);
    expect(r.flags.masters.some(m => m.startsWith("Masters"))).toBe(true);
    expect(r.votes.some(v => v.side === "home" && /Master multiplier/.test(v.reason))).toBe(true);
  });
  it("secret friends and secret enemies sit beside the trines", () => {
    expect(secretRelation("Rat", "Ox")).toBe("secret-friend");
    expect(secretRelation("Rat", "Goat")).toBe("secret-enemy");
    expect(secretRelation("Rat", "Rat")).toBe(null);
  });
  it("both master numbers wash the boost and still leave a pick", () => {
    const r = runVotes({ year: 2026, month: 10, day: 10,
      home: { name: "A", founded: [1991, 1, 1], people: [] },
      away: { name: "B", founded: [2000, 2, 7], people: [] } });
    expect(lifePath(2000, 2, 7).reduced).toBe(11);
    expect(r.decision.hard.some(x => /master/i.test(x))).toBe(true);
  });
  it("flags the August 2026 solar eclipse", () => {
    const r = runVotes({ year: 2026, month: 8, day: 12, home: { name: "H", people: [] }, away: { name: "A", people: [] } });
    expect(r.decision.eclipse).toMatch(/solar/i);
  });
  it("a thin stack still returns a pick", () => {
    const r = runVotes({ year: 2026, month: 10, day: 10, home: { name: "H", people: [] }, away: { name: "A", people: [] } });
    expect(r.pick === "home" || r.pick === "away").toBe(true);
    expect(r.decision.hard.join(" ")).not.toMatch(/no bet/i);
  });
  it("Cat/Goat/Tiger-year QB flagged for Super Bowl", () => {
    expect(championshipAlerts({ name: "QB", role: "quarterback", dob: "1987-05-05" }, "NFL").length).toBeGreaterThan(0);
  });
});

import { confidenceBand, computeConfidence } from "./vote-decode";
describe("confidence system", () => {
  it("band boundaries", () => {
    expect(confidenceBand(29)).toBe("Challenging"); expect(confidenceBand(30)).toBe("Mixed");
    expect(confidenceBand(49)).toBe("Mixed"); expect(confidenceBand(50)).toBe("Good");
    expect(confidenceBand(69)).toBe("Good"); expect(confidenceBand(70)).toBe("Strong");
    expect(confidenceBand(84)).toBe("Strong"); expect(confidenceBand(85)).toBe("Exceptional");
  });
  it("3 vs 2 = 60%, 4 vs 0 = 100%, 0 vs 0 = 50%", () => {
    const b = { noPlay: false, alerts: 0, missing: 0, tiebreakOnly: false };
    expect(computeConfidence({ ...b, winner: 3, loser: 2 })).toBe(60);
    expect(computeConfidence({ ...b, winner: 4, loser: 0 })).toBe(100);
    expect(computeConfidence({ ...b, winner: 0, loser: 0 })).toBe(50);
  });
  it("9 day costs 30", () => expect(computeConfidence({ winner: 4, loser: 0, noPlay: true, alerts: 0, missing: 0, tiebreakOnly: false })).toBe(70));
  it("all 7 steps always present", () => {
    const r = runVotes({ year: 2026, month: 10, day: 8, home: { name: "H", people: [] }, away: { name: "A", people: [] } });
    expect(r.steps.length).toBe(7);
  });
  it("fighter read from birth date", () => {
    const r = runVotes({ year: 2026, month: 10, day: 10, individual: true,
      home: { name: "Melissa Gatto", founded: [1996, 2, 5], people: [] }, away: { name: "B", founded: [1990, 1, 1], people: [] } });
    expect(r.reads.home.sign).toBe("Rat");
    expect(r.steps.length).toBe(7);
  });
  it("UFC individual bouts do not get home-field or venue-side tiebreaks", () => {
    const fighter = { name: "Fighter", founded: [1990, 1, 1] as [number, number, number], record: "10-5", people: [] };
    const r = runVotes({ year: 2026, month: 10, day: 10, league: "UFC", individual: true, home: fighter, away: { ...fighter } });
    expect(r.votes.some((v) => v.reason === "Home field")).toBe(false);
    expect(r.votes.some((v) => v.reason === "Tiebreaker: home field")).toBe(false);
    expect(r.votes.some((v) => v.reason === "Tiebreaker: neutral fighter ordering")).toBe(true);
  });
});

import { luckyNumber as _ln } from "./vote-decode";
import { test as _t, expect as _e } from "vitest";
_t("CUE lucky number", () => {
  _e(_ln(1978, 1)).toBe(18);
  _e(_ln(1990, 7)).toBe(79);
  _e(_ln(2000, 7)).toBe(72);
  _e(_ln(1980, 12)).toBe(18);
});
