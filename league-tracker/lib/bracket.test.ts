import { describe, expect, it } from "vitest";
import {
  bracketSize,
  champion,
  changedMatches,
  clearResult,
  generateBracket,
  isBye,
  roundName,
  seedOrder,
  setResult,
  shuffle,
  totalRounds,
  type BracketMatch,
} from "./bracket";

const ids = (n: number) => Array.from({ length: n }, (_, i) => `t${i + 1}`);

// Small seeded random generator so tests are repeatable.
function seeded(seed: number) {
  let s = seed;
  return () => {
    s = (s * 1664525 + 1013904223) % 4294967296;
    return s / 4294967296;
  };
}

const get = (ms: BracketMatch[], r: number, p: number) => ms.find((m) => m.round === r && m.position === p)!;

describe("sizes and names", () => {
  it("rounds up to a power of two", () => {
    expect([2, 3, 4, 5, 8, 9, 16, 17].map(bracketSize)).toEqual([2, 4, 4, 8, 8, 16, 16, 32]);
    expect([2, 4, 8, 16].map(totalRounds)).toEqual([1, 2, 3, 4]);
  });

  it("names the late rounds", () => {
    expect(roundName(3, 3)).toBe("Final");
    expect(roundName(2, 3)).toBe("Semi-finals");
    expect(roundName(1, 3)).toBe("Quarter-finals");
    expect(roundName(1, 4)).toBe("Round of 16");
    expect(roundName(1, 5)).toBe("Round of 32");
  });

  it("uses the standard seed order", () => {
    expect(seedOrder(2)).toEqual([1, 2]);
    expect(seedOrder(4)).toEqual([1, 4, 2, 3]);
    expect(seedOrder(8)).toEqual([1, 8, 4, 5, 2, 7, 3, 6]);
  });

  it("shuffle keeps every item exactly once", () => {
    const out = shuffle(ids(10), seeded(7));
    expect([...out].sort()).toEqual([...ids(10)].sort());
  });
});

describe("generateBracket", () => {
  it("returns nothing for fewer than 2 teams", () => {
    expect(generateBracket([])).toEqual([]);
    expect(generateBracket(["a"])).toEqual([]);
  });

  it("8 teams: 7 matches over 3 rounds, no byes, everyone once", () => {
    const ms = generateBracket(ids(8), seeded(1));
    expect(ms).toHaveLength(7);
    const first = ms.filter((m) => m.round === 1);
    expect(first).toHaveLength(4);
    const teams = first.flatMap((m) => [m.team1_id, m.team2_id]);
    expect(new Set(teams).size).toBe(8);
    expect(first.some(isBye)).toBe(false);
  });

  it("works for every team count from 2 to 40", () => {
    for (let n = 2; n <= 40; n++) {
      const ms = generateBracket(ids(n), seeded(n));
      const size = bracketSize(n);
      expect(ms).toHaveLength(size - 1);

      const first = ms.filter((m) => m.round === 1);
      const placed = first.flatMap((m) => [m.team1_id, m.team2_id]).filter(Boolean);
      expect(new Set(placed).size).toBe(n);
      expect(placed).toHaveLength(n);

      // byes: size - n, never two in one match
      expect(first.filter(isBye)).toHaveLength(size - n);
      expect(first.some((m) => !m.team1_id && !m.team2_id)).toBe(false);

      // each bye team is already waiting in round 2
      if (size > 2) {
        const waiting = ms
          .filter((m) => m.round === 2)
          .flatMap((m) => [m.team1_id, m.team2_id])
          .filter(Boolean);
        expect(waiting).toHaveLength(size - n);
      }
      // nothing is marked published by default
      expect(ms.every((m) => m.published === false)).toBe(true);
    }
  });

  it("different random seeds give different draws", () => {
    const a = generateBracket(ids(16), seeded(1)).filter((m) => m.round === 1).map((m) => m.team1_id);
    const b = generateBracket(ids(16), seeded(2)).filter((m) => m.round === 1).map((m) => m.team1_id);
    expect(a).not.toEqual(b);
  });
});

describe("results and advancement", () => {
  it("moves the winner into the next round, next to the neighbouring winner", () => {
    let ms = generateBracket(ids(4), seeded(3));
    const m0 = get(ms, 1, 0);
    const m1 = get(ms, 1, 1);
    ms = setResult(ms, 1, 0, 2, 1);
    ms = setResult(ms, 1, 1, 0, 3);
    const final = get(ms, 2, 0);
    expect(final.team1_id).toBe(m0.team1_id); // team1 won 2-1
    expect(final.team2_id).toBe(m1.team2_id); // team2 won 3-0
  });

  it("does not change the input array", () => {
    const ms = generateBracket(ids(4), seeded(3));
    const copy = JSON.stringify(ms);
    setResult(ms, 1, 0, 1, 0);
    expect(JSON.stringify(ms)).toBe(copy);
  });

  it("level scores need a penalty shoot-out score, and the shoot-out decides the winner", () => {
    const ms = generateBracket(ids(4), seeded(3));
    expect(() => setResult(ms, 1, 0, 1, 1)).toThrow(/penalty/);
    const out = setResult(ms, 1, 0, 1, 1, { pen1: 3, pen2: 4 });
    const m = get(out, 1, 0);
    expect(m.winner_id).toBe(get(ms, 1, 0).team2_id);
    expect([m.pen1, m.pen2]).toEqual([3, 4]);
    const other = setResult(ms, 1, 0, 0, 0, { pen1: 5, pen2: 2 });
    expect(get(other, 1, 0).winner_id).toBe(get(ms, 1, 0).team1_id);
  });

  it("a shoot-out cannot end level and must use whole numbers", () => {
    const ms = generateBracket(ids(4), seeded(3));
    expect(() => setResult(ms, 1, 0, 2, 2, { pen1: 4, pen2: 4 })).toThrow(/cannot end level/);
    expect(() => setResult(ms, 1, 0, 2, 2, { pen1: -1, pen2: 4 })).toThrow(/whole numbers/);
    expect(() => setResult(ms, 1, 0, 2, 2, { pen1: 1.5, pen2: 4 })).toThrow(/whole numbers/);
  });

  it("penalty scores are dropped when the scores are not level, and when a result is cleared", () => {
    let ms = generateBracket(ids(4), seeded(3));
    ms = setResult(ms, 1, 0, 1, 1, { pen1: 4, pen2: 2 });
    expect(get(ms, 1, 0).pen1).toBe(4);
    // ignored (and not stored) when the match is actually decided in normal time
    const normal = setResult(ms, 1, 0, 2, 1, { pen1: 4, pen2: 2 });
    expect(get(normal, 1, 0).pen1).toBeNull();
    expect(get(normal, 1, 0).pen2).toBeNull();
    const cleared = clearResult(ms, 1, 0);
    expect(get(cleared, 1, 0).pen1).toBeNull();
    expect(get(cleared, 1, 0).pen2).toBeNull();
  });

  it("a changed shoot-out score counts as a change even if the winner stays the same", () => {
    let ms = generateBracket(ids(4), seeded(3));
    ms = setResult(ms, 1, 0, 1, 1, { pen1: 4, pen2: 2 });
    const again = setResult(ms, 1, 0, 1, 1, { pen1: 5, pen2: 3 });
    expect(changedMatches(ms, again)).toHaveLength(1);
    expect(get(again, 2, 0).team1_id).toBe(get(ms, 2, 0).team1_id);
  });

  it("rejects bad scores, byes and matches with unknown teams", () => {
    const ms = generateBracket(ids(4), seeded(3));
    expect(() => setResult(ms, 1, 0, -1, 0)).toThrow();
    expect(() => setResult(ms, 1, 0, 1.5, 0)).toThrow();
    expect(() => setResult(ms, 2, 0, 1, 0)).toThrow(/Both teams/);
    const odd = generateBracket(ids(3), seeded(3));
    const bye = odd.find(isBye)!;
    expect(() => setResult(odd, bye.round, bye.position, 1, 0)).toThrow(/Both teams/);
  });

  it("crowns a champion after every round", () => {
    let ms = generateBracket(ids(4), seeded(5));
    expect(champion(ms)).toBeNull();
    ms = setResult(ms, 1, 0, 1, 0);
    ms = setResult(ms, 1, 1, 1, 0);
    ms = setResult(ms, 2, 0, 3, 2);
    expect(champion(ms)).toBe(get(ms, 2, 0).team1_id);
  });

  it("changing an earlier winner resets the matches that depended on it", () => {
    let ms = generateBracket(ids(4), seeded(5));
    ms = setResult(ms, 1, 0, 1, 0);
    ms = setResult(ms, 1, 1, 1, 0);
    ms = setResult(ms, 2, 0, 3, 2);
    expect(champion(ms)).not.toBeNull();

    const before = ms;
    const flipped = setResult(ms, 1, 0, 0, 1); // the other team now wins semi 1
    const final = get(flipped, 2, 0);
    expect(final.team1_id).toBe(get(before, 1, 0).team2_id);
    expect(final.winner_id).toBeNull();
    expect(final.score1).toBeNull();
    expect(champion(flipped)).toBeNull();
    expect(changedMatches(before, flipped).map((m) => m.round).sort()).toEqual([1, 2]);
  });

  it("re-entering the same winner with a different score does not touch later rounds", () => {
    let ms = generateBracket(ids(4), seeded(5));
    ms = setResult(ms, 1, 0, 1, 0);
    ms = setResult(ms, 1, 1, 1, 0);
    ms = setResult(ms, 2, 0, 3, 2);
    const again = setResult(ms, 1, 0, 4, 0);
    expect(get(again, 2, 0).winner_id).toBe(get(ms, 2, 0).winner_id);
    expect(changedMatches(ms, again)).toHaveLength(1);
  });

  it("clearing a result takes the winner out of the next round", () => {
    let ms = generateBracket(ids(4), seeded(5));
    ms = setResult(ms, 1, 0, 1, 0);
    expect(get(ms, 2, 0).team1_id).not.toBeNull();
    ms = clearResult(ms, 1, 0);
    expect(get(ms, 1, 0).winner_id).toBeNull();
    expect(get(ms, 2, 0).team1_id).toBeNull();
  });

  it("a full tournament of any size produces one champion and n-1 played matches", () => {
    for (let n = 2; n <= 21; n++) {
      let ms = generateBracket(ids(n), seeded(n * 3));
      let played = 0;
      const rounds = Math.max(...ms.map((m) => m.round));
      for (let r = 1; r <= rounds; r++) {
        for (const m of ms.filter((x) => x.round === r)) {
          if (m.winner_id) continue; // bye, already decided
          const cur = get(ms, r, m.position);
          expect(cur.team1_id && cur.team2_id).toBeTruthy();
          ms = setResult(ms, r, m.position, 2, 1);
          played++;
        }
      }
      expect(played).toBe(n - 1);
      expect(champion(ms)).not.toBeNull();
    }
  });
});
