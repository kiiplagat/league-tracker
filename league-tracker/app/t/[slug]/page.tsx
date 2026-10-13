import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { getPublicClient } from "@/lib/supabase";
import { computeStandings } from "@/lib/standings";
import { bracketSize, totalRounds, type BracketMatch } from "@/lib/bracket";
import StandingsTable from "@/components/StandingsTable";
import RoundList from "@/components/RoundList";
import BracketView from "@/components/BracketView";
import AutoRefresh from "@/components/AutoRefresh";
import type { Match, Team, Tournament } from "@/lib/types";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const fetchCache = "force-no-store";

async function load(slug: string) {
  const supabase = getPublicClient();
  const { data: t } = await supabase.from("tournaments").select("*").eq("slug", slug).maybeSingle();
  if (!t) return null;
  const tournament = t as Tournament;

  const teamsRes = await supabase.from("teams").select("*").eq("tournament_id", t.id);
  const teams = (teamsRes.data ?? []) as Team[];

  if (tournament.type === "knockout") {
    // Only rounds the admin has ticked (the database enforces this too).
    const { data } = await supabase
      .from("bracket_matches")
      .select("round,position,team1_id,team2_id,score1,score2,pen1,pen2,winner_id,published")
      .eq("tournament_id", t.id)
      .eq("published", true)
      .order("round")
      .order("position");
    return { kind: "knockout" as const, tournament, teams, bracket: (data ?? []) as BracketMatch[] };
  }

  const { data } = await supabase
    .from("matches")
    .select("*")
    .eq("tournament_id", t.id)
    // Only matches the admin has published (the database enforces this too).
    .eq("published", true)
    .order("round")
    .order("id");
  return { kind: "league" as const, tournament, teams, matches: (data ?? []) as Match[] };
}

export async function generateMetadata({ params }: { params: { slug: string } }): Promise<Metadata> {
  const data = await load(params.slug);
  return { title: data ? `${data.tournament.name} · League Tracker` : "League Tracker" };
}

export default async function PublicTournament({ params }: { params: { slug: string } }) {
  const data = await load(params.slug);
  if (!data) notFound();

  const { tournament, teams } = data;
  const names = Object.fromEntries(teams.map((t) => [t.id, t.name]));
  const status = tournament.status === "completed" ? "Completed" : "In progress";

  if (data.kind === "knockout") {
    const rounds = teams.length >= 2 ? totalRounds(bracketSize(teams.length)) : 0;
    const finalMatch = data.bracket.find((m) => m.round === rounds);
    const champ = finalMatch?.winner_id ?? null;
    return (
      <main className="mx-auto max-w-4xl px-4 py-6">
        <AutoRefresh seconds={15} />
        <header className="mb-5">
          <h1 className="text-2xl font-bold">{tournament.name}</h1>
          <p className="text-sm text-gray-500">
            Knockout · {teams.length} teams · {status}
          </p>
        </header>

        {champ && (
          <p className="mb-5 rounded-xl bg-green-700 p-3 text-center font-semibold text-white">
            🏆 {names[champ] ?? "?"} wins the tournament
          </p>
        )}

        <BracketView matches={data.bracket} names={names} rounds={rounds} />

        <p className="mt-8 text-center text-xs text-gray-400">View only · updates automatically</p>
      </main>
    );
  }

  const standings = computeStandings(teams, data.matches);
  const played = data.matches.filter((m) => m.played).length;

  return (
    <main className="mx-auto max-w-2xl px-4 py-6">
      <AutoRefresh seconds={15} />
      <header className="mb-5">
        <h1 className="text-2xl font-bold">{tournament.name}</h1>
        <p className="text-sm text-gray-500">
          {played} {played === 1 ? "match" : "matches"} played · {status}
        </p>
      </header>

      <h2 className="mb-2 text-lg font-semibold">Standings</h2>
      <StandingsTable rows={standings} />

      <h2 className="mb-2 mt-8 text-lg font-semibold">Matches & results</h2>
      <RoundList matches={data.matches} names={names} />

      <p className="mt-8 text-center text-xs text-gray-400">View only · updates automatically</p>
    </main>
  );
}
