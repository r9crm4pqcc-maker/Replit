import { describe, it, expect } from "vitest";
import { dateMatrix } from "./full-decode";
const m = dateMatrix([1990, 9, 8], [2026, 11, 3]);
describe("Sep 8 diagonal date matrix", () => {
  it("soulmate = k 17 and 49", () => expect(m.soulmate).toEqual(["January 15","February 13","March 11","April 9","May 7","June 5","July 3","August 1","October 29","November 27","December 25"]));
  it("fatal = k 29", () => { expect(m.fatal).toContain("January 27"); expect(m.fatal).toContain("December 5"); expect(m.fatal.length).toBe(12); });
  it("beneficial includes k 22 and 35 tracks", () => { expect(m.beneficial).toContain("January 20"); expect(m.beneficial).toContain("March 29"); expect(m.beneficial).toContain("May 1"); });
  it("challenging includes k 12, 21, 44", () => { expect(m.challenging).toContain("January 10"); expect(m.challenging).toContain("June 9"); expect(m.challenging).toContain("December 20"); });
});
