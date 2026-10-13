import type { StandingRow } from "@/lib/types";

export default function StandingsTable({ rows }: { rows: StandingRow[] }) {
  if (rows.length === 0) {
    return <p className="text-sm text-gray-500">No teams yet.</p>;
  }
  return (
    <div className="overflow-x-auto rounded-xl border border-green-900/10 bg-white shadow-sm">
      <table className="w-full min-w-[420px] text-sm">
        <thead className="bg-green-700 text-xs uppercase tracking-wide text-white">
          <tr>
            <th className="w-8 py-2 pl-3 text-left">#</th>
            <th className="py-2 text-left">Team</th>
            <th className="px-2 py-2 text-center">P</th>
            <th className="px-2 py-2 text-center">W</th>
            <th className="px-2 py-2 text-center">D</th>
            <th className="px-2 py-2 text-center">L</th>
            <th className="px-2 py-2 text-center">GF</th>
            <th className="px-2 py-2 text-center">GA</th>
            <th className="px-2 py-2 text-center">GD</th>
            <th className="py-2 pr-3 text-center">Pts</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.teamId} className="border-t border-gray-100 odd:bg-white even:bg-green-50/40">
              <td className="py-2 pl-3 font-medium text-gray-500">{r.rank}</td>
              <td className="py-2 pr-2 font-semibold">{r.name}</td>
              <td className="px-2 py-2 text-center">{r.played}</td>
              <td className="px-2 py-2 text-center">{r.won}</td>
              <td className="px-2 py-2 text-center">{r.drawn}</td>
              <td className="px-2 py-2 text-center">{r.lost}</td>
              <td className="px-2 py-2 text-center">{r.gf}</td>
              <td className="px-2 py-2 text-center">{r.ga}</td>
              <td className="px-2 py-2 text-center">{r.gd > 0 ? `+${r.gd}` : r.gd}</td>
              <td className="py-2 pr-3 text-center text-base font-bold text-green-800">{r.points}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="border-t border-gray-100 px-3 py-2 text-[11px] text-gray-500">
        P played · W won · D drawn · L lost · GF goals scored · GA goals conceded · GD goal difference · Pts points
        (win 3, draw 1, loss 0)
      </p>
    </div>
  );
}
