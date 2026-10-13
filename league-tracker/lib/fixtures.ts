export type Pairing = { round: number; home: string; away: string };

/**
 * Round-robin fixtures using the circle method.
 * - Every team plays every other team once (twice when `double` is true).
 * - With an odd number of teams, one team sits out each round (a bye, no match row).
 * - In the second leg of a double round-robin, home and away are swapped.
 */
export function generateFixtures(teamIds: string[], double = false): Pairing[] {
  if (teamIds.length < 2) return [];

  const slots: (string | null)[] = [...teamIds];
  if (slots.length % 2 === 1) slots.push(null); // bye

  const n = slots.length;
  const roundsPerLeg = n - 1;
  const half = n / 2;
  const firstLeg: Pairing[] = [];

  let arr = [...slots];
  for (let r = 0; r < roundsPerLeg; r++) {
    for (let i = 0; i < half; i++) {
      const a = arr[i];
      const b = arr[n - 1 - i];
      if (!a || !b) continue;
      // Alternate home/away so no team is always home.
      const aHome = (r + i) % 2 === 0;
      firstLeg.push({
        round: r + 1,
        home: aHome ? a : b,
        away: aHome ? b : a,
      });
    }
    // Keep the first slot fixed, rotate the rest.
    arr = [arr[0], arr[n - 1], ...arr.slice(1, n - 1)];
  }

  if (!double) return firstLeg;

  const secondLeg = firstLeg.map((p) => ({
    round: p.round + roundsPerLeg,
    home: p.away,
    away: p.home,
  }));
  return [...firstLeg, ...secondLeg];
}
