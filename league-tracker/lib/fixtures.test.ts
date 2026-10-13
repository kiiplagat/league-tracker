import { describe, expect, it } from "vitest";
import { generateFixtures } from "./fixtures";

const ids = (n: number) => Array.from({ length: n }, (_, i) => `t${i + 1}`);

function pairKey(a: string, b: string) {
  return [a, b].sort().join("|");
}

describe("generateFixtures", () => {
  it("returns nothing for fewer than 2 teams", () => {
    expect(generateFixtures([])).toEqual([]);
    expect(generateFixtures(["a"])).toEqual([]);
  });

  it("4 teams: 6 matches over 3 rounds, everyone plays everyone once", () => {
    const f = generateFixtures(ids(4));
    expect(f).toHaveLength(6);
    expect(new Set(f.map((m) => m.round)).size).toBe(3);
    expect(new Set(f.map((m) => pairKey(m.home, m.away))).size).toBe(6);
  });

  it("no team plays twice in the same round", () => {
    for (const n of [3, 4, 5, 6, 7, 8]) {
      const f = generateFixtures(ids(n), true);
      const byRound = new Map<number, string[]>();
      for (const m of f) {
        byRound.set(m.round, [...(byRound.get(m.round) ?? []), m.home, m.away]);
      }
      for (const teams of byRound.values()) {
        expect(new Set(teams).size).toBe(teams.length);
      }
    }
  });

  it("5 teams (odd): 10 matches over 5 rounds, byes produce no match", () => {
    const f = generateFixtures(ids(5));
    expect(f).toHaveLength(10);
    expect(new Set(f.map((m) => m.round)).size).toBe(5);
    expect(new Set(f.map((m) => pairKey(m.home, m.away))).size).toBe(10);
  });

  it("double round-robin: each pairing twice, with home and away swapped", () => {
    const f = generateFixtures(ids(4), true);
    expect(f).toHaveLength(12);
    expect(Math.max(...f.map((m) => m.round))).toBe(6);
    const ordered = new Set(f.map((m) => `${m.home}>${m.away}`));
    expect(ordered.size).toBe(12);
  });

  it("2 teams works", () => {
    expect(generateFixtures(["a", "b"])).toHaveLength(1);
    expect(generateFixtures(["a", "b"], true)).toHaveLength(2);
  });
});
