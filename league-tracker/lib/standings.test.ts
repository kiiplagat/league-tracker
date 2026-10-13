import { describe, expect, it } from "vitest";
import { computeStandings } from "./standings";
import type { Match } from "./types";

const teams = [
  { id: "a", name: "Arrows" },
  { id: "b", name: "Bulls" },
  { id: "c", name: "Comets" },
];

let n = 0;
function m(
  home: string,
  away: string,
  hs: number | null,
  as: number | null,
  played = true
): Match {
  return {
    id: `m${n++}`,
    tournament_id: "t",
    round: 1,
    home_team_id: home,
    away_team_id: away,
    home_score: hs,
    away_score: as,
    played,
    played_at: null,
    published: true,
  };
}

describe("computeStandings", () => {
  it("gives 3 for a win, 1 for a draw, 0 for a loss", () => {
    const rows = computeStandings(teams, [m("a", "b", 2, 0), m("b", "c", 1, 1)]);
    const byId = Object.fromEntries(rows.map((r) => [r.teamId, r]));
    expect(byId.a.points).toBe(3);
    expect(byId.b.points).toBe(1);
    expect(byId.c.points).toBe(1);
    expect(byId.a.won).toBe(1);
    expect(byId.b.lost).toBe(1);
    expect(byId.b.drawn).toBe(1);
  });

  it("tracks goals scored, conceded and difference", () => {
    const rows = computeStandings(teams, [m("a", "b", 3, 1), m("c", "a", 0, 2)]);
    const a = rows.find((r) => r.teamId === "a")!;
    expect(a.gf).toBe(5);
    expect(a.ga).toBe(1);
    expect(a.gd).toBe(4);
    expect(a.played).toBe(2);
  });

  it("ignores unplayed matches and matches with missing scores", () => {
    const rows = computeStandings(teams, [m("a", "b", null, null, false), m("a", "c", 1, null, true)]);
    expect(rows.every((r) => r.played === 0 && r.points === 0)).toBe(true);
  });

  it("ranks by points, then goal difference, then goals scored, then name", () => {
    // a and b both win once (3 pts). a: +1 GD, b: +3 GD, so b ranks above a.
    const rows = computeStandings(teams, [m("a", "c", 1, 0), m("b", "c", 3, 0)]);
    expect(rows.map((r) => r.teamId)).toEqual(["b", "a", "c"]);
    expect(rows.map((r) => r.rank)).toEqual([1, 2, 3]);
  });

  it("falls back to goals scored, then name", () => {
    // a beats c 2-1 (+1, gf 2); b beats c 1-0 (+1, gf 1): a above b on goals scored.
    const byGoals = computeStandings(teams, [m("a", "c", 2, 1), m("b", "c", 1, 0)]);
    expect(byGoals.map((r) => r.teamId)).toEqual(["a", "b", "c"]);
    // Nothing played: alphabetical.
    const byName = computeStandings(teams, []);
    expect(byName.map((r) => r.name)).toEqual(["Arrows", "Bulls", "Comets"]);
  });
});
