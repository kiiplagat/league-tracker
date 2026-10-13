import { isBye, roundName, type BracketMatch } from "@/lib/bracket";

type Names = Record<string, string>;

function Side({
  teamId,
  names,
  score,
  pen,
  won,
  lost,
  bye,
}: {
  teamId: string | null;
  names: Names;
  score: number | null;
  /** Penalty shoot-out score, shown in brackets after the normal score. */
  pen: number | null;
  won: boolean;
  lost: boolean;
  bye: boolean;
}) {
  const label = teamId ? (names[teamId] ?? "?") : bye ? "Bye" : "TBD";
  const muted = !teamId;
  return (
    <div
      className={`flex items-center justify-between gap-2 px-2.5 py-1.5 text-sm ${
        won ? "bg-green-50 font-bold text-green-900" : lost ? "text-gray-400" : ""
      }`}
    >
      <span className={`truncate ${muted ? "italic text-gray-400" : ""}`}>{label}</span>
      <span className="shrink-0 text-right tabular-nums">
        {score ?? ""}
        {pen !== null && <span className="ml-1 text-xs font-semibold text-gray-500">({pen})</span>}
      </span>
    </div>
  );
}

/**
 * Read-only bracket, one column per round. Winners sit next to the match they
 * came from, so each match faces the winner of the neighbouring match.
 * Used on the public page (only published rounds are passed in) and in the admin.
 */
export default function BracketView({
  matches,
  names,
  rounds,
}: {
  matches: BracketMatch[];
  names: Names;
  /** Total number of rounds in the whole bracket (the last one is the final). */
  rounds: number;
}) {
  const byRound = new Map<number, BracketMatch[]>();
  for (const m of matches) byRound.set(m.round, [...(byRound.get(m.round) ?? []), m]);
  const columns = Array.from(byRound.entries()).sort((a, b) => a[0] - b[0]);

  if (columns.length === 0) {
    return (
      <p className="rounded-xl border border-dashed border-gray-300 bg-white p-4 text-sm text-gray-500">
        No rounds published yet. Check back soon.
      </p>
    );
  }

  return (
    <div>
      {columns.length > 1 && <p className="mb-2 text-xs text-gray-400">Swipe sideways to see the later rounds.</p>}
      <div className="overflow-x-auto pb-3">
        <div className="flex min-w-max gap-5">
          {columns.map(([round, list]) => (
            <div key={round} className="flex w-56 shrink-0 flex-col">
              <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-green-800">
                {roundName(round, rounds)}
              </h3>
              <div className="flex flex-1 flex-col justify-around gap-3">
                {[...list]
                  .sort((a, b) => a.position - b.position)
                  .map((m) => {
                    const bye = isBye(m);
                    return (
                      <div
                        key={`${m.round}-${m.position}`}
                        className="divide-y divide-gray-100 overflow-hidden rounded-lg border border-green-900/10 bg-white shadow-sm"
                      >
                        <Side
                          teamId={m.team1_id}
                          names={names}
                          score={m.score1}
                          pen={m.pen1}
                          won={!!m.winner_id && m.winner_id === m.team1_id}
                          lost={!!m.winner_id && !!m.team1_id && m.winner_id !== m.team1_id}
                          bye={bye}
                        />
                        <Side
                          teamId={m.team2_id}
                          names={names}
                          score={m.score2}
                          pen={m.pen2}
                          won={!!m.winner_id && m.winner_id === m.team2_id}
                          lost={!!m.winner_id && !!m.team2_id && m.winner_id !== m.team2_id}
                          bye={bye}
                        />
                      </div>
                    );
                  })}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
