import type { Match } from "@/lib/types";

export function groupByRound(matches: Match[]): [number, Match[]][] {
  const map = new Map<number, Match[]>();
  for (const m of matches) {
    map.set(m.round, [...(map.get(m.round) ?? []), m]);
  }
  return Array.from(map.entries()).sort((a, b) => a[0] - b[0]);
}

/** Read-only fixtures and results, used on the public page. */
export default function RoundList({
  matches,
  names,
}: {
  matches: Match[];
  names: Record<string, string>;
}) {
  const rounds = groupByRound(matches);
  if (rounds.length === 0) {
    return (
      <p className="rounded-xl border border-dashed border-gray-300 bg-white p-4 text-sm text-gray-500">
        No matches published yet. Check back soon.
      </p>
    );
  }

  return (
    <div className="space-y-4">
      {rounds.map(([round, list]) => (
        <section key={round} className="overflow-hidden rounded-xl border border-green-900/10 bg-white shadow-sm">
          <h3 className="bg-green-50 px-3 py-2 text-xs font-semibold uppercase tracking-wide text-green-800">
            Round {round}
          </h3>
          <ul>
            {list.map((m) => (
              <li
                key={m.id}
                className="grid grid-cols-[1fr_auto_1fr] items-center gap-2 border-t border-gray-100 px-3 py-2.5 text-sm"
              >
                <span className="truncate text-right font-medium">{names[m.home_team_id] ?? "?"}</span>
                <span
                  className={`min-w-[3.5rem] rounded-md px-2 py-1 text-center text-sm font-bold ${
                    m.played ? "bg-green-700 text-white" : "bg-gray-100 text-gray-400"
                  }`}
                >
                  {m.played ? `${m.home_score} - ${m.away_score}` : "vs"}
                </span>
                <span className="truncate font-medium">{names[m.away_team_id] ?? "?"}</span>
              </li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}
