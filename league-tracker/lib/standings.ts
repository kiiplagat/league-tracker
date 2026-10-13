import type { Match, StandingRow } from "./types";

type TeamLike = { id: string; name: string };

/**
 * Win = 3 points, draw = 1, loss = 0.
 * Table order: points, then goal difference, then goals scored, then name.
 * Only matches with `played` and both scores present count.
 */
export function computeStandings(teams: TeamLike[], matches: Match[]): StandingRow[] {
  const rows = new Map<string, Omit<StandingRow, "rank">>();
  for (const t of teams) {
    rows.set(t.id, {
      teamId: t.id,
      name: t.name,
      played: 0,
      won: 0,
      drawn: 0,
      lost: 0,
      gf: 0,
      ga: 0,
      gd: 0,
      points: 0,
    });
  }

  for (const m of matches) {
    if (!m.played || m.home_score === null || m.away_score === null) continue;
    const home = rows.get(m.home_team_id);
    const away = rows.get(m.away_team_id);
    if (!home || !away) continue;

    home.played++;
    away.played++;
    home.gf += m.home_score;
    home.ga += m.away_score;
    away.gf += m.away_score;
    away.ga += m.home_score;

    if (m.home_score > m.away_score) {
      home.won++;
      home.points += 3;
      away.lost++;
    } else if (m.home_score < m.away_score) {
      away.won++;
      away.points += 3;
      home.lost++;
    } else {
      home.drawn++;
      away.drawn++;
      home.points += 1;
      away.points += 1;
    }
  }

  const list = Array.from(rows.values()).map((r) => ({ ...r, gd: r.gf - r.ga }));
  list.sort(
    (a, b) =>
      b.points - a.points ||
      b.gd - a.gd ||
      b.gf - a.gf ||
      a.name.localeCompare(b.name)
  );

  return list.map((r, i) => ({ ...r, rank: i + 1 }));
}
