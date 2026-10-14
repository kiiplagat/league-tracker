"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { getSupabase } from "@/lib/supabase";
import { generateFixtures } from "@/lib/fixtures";
import { bracketSize, generateBracket, roundName, totalRounds } from "@/lib/bracket";
import { makeSlug } from "@/lib/slug";
import type { Tournament, TournamentFormat, TournamentType } from "@/lib/types";

export default function AdminDashboard() {
  const router = useRouter();
  const [ready, setReady] = useState(false);
  const [userId, setUserId] = useState<string | null>(null);
  const [tournaments, setTournaments] = useState<Tournament[]>([]);
  const [error, setError] = useState<string | null>(null);

  const [kind, setKind] = useState<TournamentType>("league");
  const [name, setName] = useState("");
  const [format, setFormat] = useState<TournamentFormat>("single");
  const [teamText, setTeamText] = useState("");
  const [creating, setCreating] = useState(false);

  const load = useCallback(async (uid: string) => {
    const { data, error } = await getSupabase()
      .from("tournaments")
      .select("*")
      .eq("owner_id", uid)
      .order("created_at", { ascending: false });
    if (error) setError(error.message);
    else setTournaments((data ?? []) as Tournament[]);
  }, []);

  useEffect(() => {
    (async () => {
      try {
        const { data } = await getSupabase().auth.getSession();
        if (!data.session) {
          router.replace("/login");
          return;
        }
        setUserId(data.session.user.id);
        await load(data.session.user.id);
        setReady(true);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Failed to load");
        setReady(true);
      }
    })();
  }, [router, load]);

  const teamNames = Array.from(
    new Set(
      teamText
        .split(/\r?\n|,/)
        .map((t) => t.trim())
        .filter(Boolean)
    )
  );

  async function createTournament(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!name.trim()) return setError("Give the tournament a name.");
    if (teamNames.length < 2) return setError("Add at least 2 teams (one per line).");
    if (!userId) return;

    setCreating(true);
    const supabase = getSupabase();
    let createdId: string | null = null;
    try {
      const base =
        kind === "knockout"
          ? { name: name.trim(), type: "knockout", slug: makeSlug(name) }
          : { name: name.trim(), format, slug: makeSlug(name) };
      const { data: t, error: tErr } = await supabase.from("tournaments").insert(base).select().single();
      if (tErr) throw tErr;
      createdId = t.id;

      const { data: teams, error: teamErr } = await supabase
        .from("teams")
        .insert(teamNames.map((n) => ({ tournament_id: t.id, name: n })))
        .select();
      if (teamErr) throw teamErr;
      const teamIds = teams!.map((x: { id: string }) => x.id);

      if (kind === "knockout") {
        // Random draw, byes included. Everything starts hidden from participants.
        const rows = generateBracket(teamIds).map((m) => ({ ...m, tournament_id: t.id }));
        const { error: bErr } = await supabase.from("bracket_matches").insert(rows);
        if (bErr) throw bErr;
        router.push(`/admin/k/${t.id}`);
        return;
      }

      const pairs = generateFixtures(teamIds, format === "double");
      const { error: mErr } = await supabase.from("matches").insert(
        pairs.map((p) => ({
          tournament_id: t.id,
          round: p.round,
          home_team_id: p.home,
          away_team_id: p.away,
        }))
      );
      if (mErr) throw mErr;

      router.push(`/admin/${t.id}`);
    } catch (err) {
      if (createdId) await supabase.from("tournaments").delete().eq("id", createdId);
      const msg = err instanceof Error ? err.message : "Could not create tournament";
      setError(
        kind === "knockout" && /type|bracket_matches/i.test(msg)
          ? `${msg}. Run supabase/add-knockout.sql in the Supabase SQL editor once, then try again.`
          : msg
      );
      setCreating(false);
    }
  }

  async function signOut() {
    await getSupabase().auth.signOut();
    router.replace("/login");
  }

  if (!ready) return <p className="p-6 text-gray-500">Loading…</p>;

  const n = teamNames.length;
  const matchCount = n < 2 ? 0 : generateFixtures(teamNames.map((_, i) => String(i)), format === "double").length;
  const size = n < 2 ? 0 : bracketSize(n);
  const rounds = n < 2 ? 0 : totalRounds(size);

  return (
    <main className="mx-auto max-w-2xl px-4 py-6">
      <header className="mb-6 flex items-center justify-between">
        <h1 className="text-2xl font-bold">Your tournaments</h1>
        <button onClick={signOut} className="text-sm text-gray-500">
          Sign out
        </button>
      </header>

      {error && <p className="mb-4 rounded-lg bg-red-50 p-3 text-sm text-red-700">{error}</p>}

      <section className="mb-8">
        {tournaments.length === 0 ? (
          <p className="text-sm text-gray-500">Nothing yet. Create your first tournament below.</p>
        ) : (
          <ul className="space-y-2">
            {tournaments.map((t) => {
              const isKnockout = t.type === "knockout";
              return (
                <li key={t.id}>
                  <Link
                    href={isKnockout ? `/admin/k/${t.id}` : `/admin/${t.id}`}
                    className="flex items-center justify-between rounded-xl border border-green-900/10 bg-white px-4 py-3 shadow-sm active:bg-green-50"
                  >
                    <div>
                      <p className="font-semibold">{t.name}</p>
                      <p className="text-xs text-gray-500">
                        {isKnockout ? "Knockout bracket" : t.format === "double" ? "League · home & away" : "League · single round"}{" "}
                        · {new Date(t.created_at).toLocaleDateString()}
                      </p>
                    </div>
                    <span
                      className={`rounded-full px-2.5 py-1 text-xs font-medium ${
                        t.status === "completed" ? "bg-gray-100 text-gray-600" : "bg-green-100 text-green-800"
                      }`}
                    >
                      {t.status === "completed" ? "Completed" : "Active"}
                    </span>
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      <section className="rounded-2xl border border-green-900/10 bg-white p-4 shadow-sm">
        <h2 className="mb-3 text-lg font-semibold">New tournament</h2>

        <div className="mb-3 grid grid-cols-2 rounded-xl bg-gray-200/70 p-1 text-sm font-medium">
          {(["league", "knockout"] as const).map((k) => (
            <button
              type="button"
              key={k}
              onClick={() => setKind(k)}
              className={`rounded-lg py-2 ${kind === k ? "bg-white shadow-sm" : "text-gray-600"}`}
            >
              {k === "league" ? "League (table)" : "Knockout (bracket)"}
            </button>
          ))}
        </div>

        <form onSubmit={createTournament} className="space-y-3">
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Tournament name"
            className="w-full rounded-xl border border-gray-300 px-4 py-3 text-base outline-none focus:border-green-600"
          />

          {kind === "league" ? (
            <div className="grid grid-cols-2 gap-2 text-sm">
              {(["single", "double"] as const).map((f) => (
                <button
                  type="button"
                  key={f}
                  onClick={() => setFormat(f)}
                  className={`rounded-xl border px-3 py-2.5 font-medium ${
                    format === f ? "border-green-700 bg-green-700 text-white" : "border-gray-300 bg-white"
                  }`}
                >
                  {f === "single" ? "Play each team once" : "Home & away"}
                </button>
              ))}
            </div>
          ) : (
            <p className="rounded-xl bg-green-50 p-3 text-xs text-green-900">
              Teams are drawn at random into a bracket. Winners move on to face the winner of the neighbouring match;
              losers are out. If the number of teams is not 2, 4, 8, 16…, some teams get a bye into the next round.
            </p>
          )}

          <textarea
            value={teamText}
            onChange={(e) => setTeamText(e.target.value)}
            rows={7}
            placeholder={"Teams, one per line\nBarcelona FC\nArgentina United\nLiverpool"}
            className="w-full rounded-xl border border-gray-300 px-4 py-3 text-base outline-none focus:border-green-600"
          />

          <p className="text-xs text-gray-500">
            {n} team{n === 1 ? "" : "s"}
            {kind === "league" && matchCount > 0 && ` → ${matchCount} matches will be created`}
            {kind === "knockout" &&
              n >= 2 &&
              ` → ${rounds} round${rounds === 1 ? "" : "s"} (starting with ${roundName(1, rounds)}), ${n - 1} matches${
                size > n ? `, ${size - n} bye${size - n === 1 ? "" : "s"}` : ""
              }`}
          </p>

          <button
            disabled={creating}
            className="w-full rounded-xl bg-green-700 px-4 py-3 font-semibold text-white disabled:opacity-60 active:bg-green-800"
          >
            {creating
              ? "Creating…"
              : kind === "league"
                ? "Create tournament & generate matches"
                : "Draw the bracket"}
          </button>
        </form>
      </section>
    </main>
  );
}
