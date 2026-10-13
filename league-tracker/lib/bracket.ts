/**
 * Single-elimination bracket logic (pure functions, no database calls).
 *
 * - Teams are drawn into the bracket at random.
 * - The bracket has the next power of two slots. Missing teams are "byes": a team
 *   facing a bye goes straight into the next round.
 * - Winners move on to face the winner of the neighbouring match. Losers are out.
 */

export type BracketMatch = {
  id?: string;
  /** 1 = first round, the last round is the final. */
  round: number;
  /** 0-based position within the round, top to bottom. */
  position: number;
  team1_id: string | null;
  team2_id: string | null;
  score1: number | null;
  score2: number | null;
  /** Penalty shoot-out score, only set when score1 === score2. */
  pen1: number | null;
  pen2: number | null;
  winner_id: string | null;
  published: boolean;
};

export type Penalties = { pen1: number; pen2: number };

/** Smallest power of two that fits n teams (n >= 2). */
export function bracketSize(n: number): number {
  let size = 2;
  while (size < n) size *= 2;
  return size;
}

export function totalRounds(size: number): number {
  return Math.round(Math.log2(size));
}

/**
 * Standard seed placement: seed 1 meets the last seed, and the best seeds
 * only meet late. For 8 slots: [1, 8, 4, 5, 2, 7, 3, 6]. Consecutive pairs are
 * the first-round matches. Because byes are always the highest seed numbers,
 * no first-round match can have two byes.
 */
export function seedOrder(size: number): number[] {
  let order = [1];
  while (order.length < size) {
    const total = order.length * 2;
    const next: number[] = [];
    for (const seed of order) next.push(seed, total + 1 - seed);
    order = next;
  }
  return order;
}

export function shuffle<T>(items: T[], rng: () => number = Math.random): T[] {
  const a = [...items];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

export function roundName(round: number, rounds: number): string {
  const remaining = rounds - round;
  if (remaining === 0) return "Final";
  if (remaining === 1) return "Semi-finals";
  if (remaining === 2) return "Quarter-finals";
  return `Round of ${2 ** (rounds - round + 1)}`;
}

function find(ms: BracketMatch[], round: number, position: number): BracketMatch | undefined {
  return ms.find((m) => m.round === round && m.position === position);
}

/** A first-round match where only one team is present: that team advances automatically. */
export function isBye(m: BracketMatch): boolean {
  return m.round === 1 && (m.team1_id === null) !== (m.team2_id === null);
}

/**
 * Put `teamId` (or nothing) into the slot of the next round that this match feeds.
 * If that next match already had a result that depended on the old team, the result
 * is cleared, and the clearing cascades to later rounds.
 */
function setNextSlot(ms: BracketMatch[], m: BracketMatch, teamId: string | null): void {
  const next = find(ms, m.round + 1, Math.floor(m.position / 2));
  if (!next) return;
  const key = m.position % 2 === 0 ? "team1_id" : "team2_id";
  if (next[key] === teamId) return;
  next[key] = teamId;
  if (next.winner_id !== null || next.score1 !== null || next.score2 !== null) {
    next.winner_id = null;
    next.score1 = null;
    next.score2 = null;
    next.pen1 = null;
    next.pen2 = null;
    setNextSlot(ms, next, null);
  }
}

/** Randomly draw the teams into a bracket. Returns every match of every round. */
export function generateBracket(teamIds: string[], rng: () => number = Math.random): BracketMatch[] {
  const n = teamIds.length;
  if (n < 2) return [];

  const size = bracketSize(n);
  const rounds = totalRounds(size);
  const seeds = shuffle(teamIds, rng); // seeds[0] is seed 1
  const order = seedOrder(size);

  const matches: BracketMatch[] = [];
  for (let r = 1; r <= rounds; r++) {
    const count = size / 2 ** r;
    for (let p = 0; p < count; p++) {
      matches.push({
        round: r,
        position: p,
        team1_id: null,
        team2_id: null,
        score1: null,
        score2: null,
        pen1: null,
        pen2: null,
        winner_id: null,
        published: false,
      });
    }
  }

  for (let p = 0; p < size / 2; p++) {
    const m = find(matches, 1, p)!;
    m.team1_id = seeds[order[2 * p] - 1] ?? null;
    m.team2_id = seeds[order[2 * p + 1] - 1] ?? null;
    if (m.team1_id && !m.team2_id) m.winner_id = m.team1_id;
    else if (m.team2_id && !m.team1_id) m.winner_id = m.team2_id;
  }
  for (const m of matches) {
    if (m.round === 1 && m.winner_id) setNextSlot(matches, m, m.winner_id);
  }

  return matches;
}

/**
 * Record a result. If the scores are level the match went to a penalty shoot-out and
 * `pens` (the shoot-out score) is required; it cannot be level. Returns a new array and
 * does not change the input. The winner is placed into the next round. If this changes
 * an earlier winner, later results that depended on it are reset.
 */
export function setResult(
  matches: BracketMatch[],
  round: number,
  position: number,
  score1: number,
  score2: number,
  pens?: Penalties
): BracketMatch[] {
  const ms = matches.map((m) => ({ ...m }));
  const m = find(ms, round, position);
  if (!m) throw new Error("Match not found.");
  if (!m.team1_id || !m.team2_id) throw new Error("Both teams must be known before you can enter a result.");
  if (!Number.isInteger(score1) || !Number.isInteger(score2) || score1 < 0 || score2 < 0) {
    throw new Error("Scores must be whole numbers, 0 or more.");
  }

  let winner: string;
  let pen1: number | null = null;
  let pen2: number | null = null;
  if (score1 > score2) winner = m.team1_id;
  else if (score2 > score1) winner = m.team2_id;
  else {
    if (!pens) throw new Error("The scores are level. Enter the penalty shoot-out score.");
    if (!Number.isInteger(pens.pen1) || !Number.isInteger(pens.pen2) || pens.pen1 < 0 || pens.pen2 < 0) {
      throw new Error("Penalty scores must be whole numbers, 0 or more.");
    }
    if (pens.pen1 === pens.pen2) {
      throw new Error("A penalty shoot-out cannot end level. One team must score more penalties.");
    }
    winner = pens.pen1 > pens.pen2 ? m.team1_id : m.team2_id;
    pen1 = pens.pen1;
    pen2 = pens.pen2;
  }

  const previous = m.winner_id;
  m.score1 = score1;
  m.score2 = score2;
  m.pen1 = pen1;
  m.pen2 = pen2;
  m.winner_id = winner;
  if (previous !== winner) setNextSlot(ms, m, winner);
  return ms;
}

/** Remove a result and take the winner back out of the next round (cascading). */
export function clearResult(matches: BracketMatch[], round: number, position: number): BracketMatch[] {
  const ms = matches.map((m) => ({ ...m }));
  const m = find(ms, round, position);
  if (!m) throw new Error("Match not found.");
  if (!m.team1_id || !m.team2_id) throw new Error("This match has no result to clear.");
  const previous = m.winner_id;
  m.score1 = null;
  m.score2 = null;
  m.pen1 = null;
  m.pen2 = null;
  m.winner_id = null;
  if (previous) setNextSlot(ms, m, null);
  return ms;
}

export function champion(matches: BracketMatch[]): string | null {
  if (matches.length === 0) return null;
  const last = Math.max(...matches.map((m) => m.round));
  return matches.find((m) => m.round === last)?.winner_id ?? null;
}

/** Matches whose teams, scores or winner differ between two versions of the same bracket. */
export function changedMatches(before: BracketMatch[], after: BracketMatch[]): BracketMatch[] {
  const out: BracketMatch[] = [];
  for (const a of after) {
    const b = find(before, a.round, a.position);
    if (
      !b ||
      b.team1_id !== a.team1_id ||
      b.team2_id !== a.team2_id ||
      b.score1 !== a.score1 ||
      b.score2 !== a.score2 ||
      b.pen1 !== a.pen1 ||
      b.pen2 !== a.pen2 ||
      b.winner_id !== a.winner_id
    ) {
      out.push(a);
    }
  }
  return out;
}
