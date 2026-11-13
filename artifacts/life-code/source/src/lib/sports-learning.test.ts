import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { runVotes } from "./vote-decode";
import {
  LEARNING_UPDATED_EVENT,
  layerMultiplier,
  layerWeights,
  logStepPick,
  outcomeFromScore,
  scoreStepPick,
} from "./sports-learning";

function installWindow() {
  const values = new Map<string, string>();
  return {
    localStorage: {
      getItem: (key: string) => values.get(key) ?? null,
      setItem: (key: string, value: string) => values.set(key, value),
      removeItem: (key: string) => values.delete(key),
      clear: () => values.clear(),
    },
    dispatchEvent: vi.fn(() => true),
  };
}

describe("sports learning feedback", () => {
  beforeEach(() => {
    const fakeWindow = installWindow();
    vi.stubGlobal("window", fakeWindow);
    vi.stubGlobal("localStorage", fakeWindow.localStorage);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("keeps unproven layers at baseline so they can collect evidence", () => {
    expect(layerMultiplier("Game-day energy")).toBe(1);
  });

  it("applies a learned layer weight to later predictions and notifies the page", () => {
    const input = {
      year: 2026,
      month: 10,
      day: 8,
      league: "NFL",
      home: { name: "Home Example", record: "0-0", people: [] },
      away: { name: "Away Example", record: "0-0", people: [] },
    };
    const first = runVotes(input);
    const firstHomeField = first.votes.find((vote) => vote.reason === "Home field");
    expect(firstHomeField?.weight).toBeCloseTo(0.35, 2);

    logStepPick({
      id: "completed-game",
      date: "2026-10-08",
      home: "Home Example",
      away: "Away Example",
      pick: "home",
      votes: [{ side: "home", layer: "Records", weight: 1 }],
    });
    scoreStepPick("completed-game", "home");

    expect(layerWeights().Records).toBe(1.06);
    const later = runVotes(input);
    const laterHomeField = later.votes.find((vote) => vote.reason === "Home field");
    expect(laterHomeField?.weight).toBeCloseTo(0.37, 2);
    expect(window.dispatchEvent).toHaveBeenCalledWith(expect.objectContaining({ type: LEARNING_UPDATED_EVENT }));
  });

  it("classifies completed-game scores without turning a draw into an away win", () => {
    expect(outcomeFromScore(2, 1)).toBe("home");
    expect(outcomeFromScore(1, 2)).toBe("away");
    expect(outcomeFromScore(1, 1)).toBe("draw");
    expect(outcomeFromScore(Number.NaN, 1)).toBeNull();
  });
});
