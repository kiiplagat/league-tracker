"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { getSupabase } from "@/lib/supabase";
import { computeStandings } from "@/lib/standings";
import StandingsTable from "@/components/StandingsTable";
import { groupByRound } from "@/components/RoundList";
import type { Match, Team, Tournament } from "@/lib/types";

type Draft = { home: string; away: string };

function download(filename: string, text: string) {
  const blob = new Blob([text], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

const csvCell = (v: string | number | null) => `"${String(v ?? "").replace(/"/g, '""')}"`;

export default function ManageTournament() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();

  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [tournament, setTournament] = useState<Tournament | null>(null);
  const [teams, setTeams] = useState<Team[]>([]);
  const [matches, setMatches] = useState<Match[]>([]);
  const [drafts, setDrafts] = useState<Record<string, Draft>>({});
  const [savingId, setSavingId] = useState<string | null>(null);
  const [publishBusy, setPublishBusy] = useState<string | null>(null);
  const [tab, setTab] = useState<"fixtures" | "table">("fixtures");
  const [copied, setCopied] = useState(false);

  const load = useCallback(async () => {
    const supabase = getSupabase();
    const [t, tm, m] = await Promise.all([
      supabase.from("tournaments").select("*").eq("id", id).single(),
      supabase.from("teams").select("*").eq("tournament_id", id),
      supabase.from("matches").select("*").eq("tournament_id", id).order("round").order("id"),
    ]);
    if (t.error) throw t.error;
    if (tm.error) throw tm.error;
    if (m.error) throw m.error;
    if ((t.data as Tournament).type === "knockout") {
      router.replace(`/admin/k/${id}`);
      return;
    }
    setTournament(t.data as Tournament);
    setTeams(tm.data as Team[]);
    const list = m.data as Match[];
    setMatches(list);
    setDrafts(
      Object.fromEntries(
        list.map((x) => [
          x.id,
          {
            home: x.home_score === null ? "" : String(x.home_score),
            away: x.away_score === null ? "" : String(x.away_score),
          },
        ])
      )
    );
  }, [id, router]);

  useEffect(() => {
    (async () => {
      try {
        const { data } = await getSupabase().auth.getSession();
        if (!data.session) {
          router.replace("/login");
          return;
        }
        await load();
      } catch (e) {
        setError(e instanceof Error ? e.message : "Failed to load");
      } finally {
        setReady(true);
      }
    })();
  }, [router, load]);

  const names = useMemo(() => Object.fromEntries(teams.map((t) => [t.id, t.name])), [teams]);
  const standings = useMemo(() => computeStandings(teams, matches), [teams, matches]);
  const rounds = useMemo(() => groupByRound(matches), [matches]);
  const playedCount = matches.filter((m) => m.played).length;
  const shareUrl = tournament && typeof window !== "undefined" ? `${window.location.origin}/t/${tournament.slug}` : "";

  function setDraft(matchId: string, side: keyof Draft, value: string) {
    if (value !== "" && !/^\d{1,3}$/.test(value)) return;
    setDrafts((d) => ({ ...d, [matchId]: { ...d[matchId], [side]: value } }));
  }

  async function saveResult(m: Match, publish = false) {
    const d = drafts[m.id];
    if (!d || d.home === "" || d.away === "") {
      setError("Enter both scores before saving.");
      return;
    }
    setError(null);
    setSavingId(m.id);
    const patch = {
      home_score: Number(d.home),
      away_score: Number(d.away),
      played: true,
      played_at: new Date().toISOString(),
      ...(publish ? { published: true } : {}),
    };
    const { data, error } = await getSupabase().from("matches").update(patch).eq("id", m.id).select("id");
    setSavingId(null);
    if (error) return setError(error.message);
    if (!data || data.length === 0) {
      return setError("That score was NOT saved. Sign out, sign in again and retry.");
    }
    setMatches((list) => list.map((x) => (x.id === m.id ? { ...x, ...patch } : x)));
  }

  async function clearResult(m: Match) {
    setError(null);
    setSavingId(m.id);
    const patch = { home_score: null, away_score: null, played: false, played_at: null };
    const { error } = await getSupabase().from("matches").update(patch).eq("id", m.id);
    setSavingId(null);
    if (error) return setError(error.message);
    setMatches((list) => list.map((x) => (x.id === m.id ? { ...x, ...patch } : x)));
    setDrafts((ds) => ({ ...ds, [m.id]: { home: "", away: "" } }));
  }

  async function setPublished(key: string, ids: string[], published: boolean) {
    if (ids.length === 0) return;
    setError(null);
    setPublishBusy(key);
    const { data, error } = await getSupabase().from("matches").update({ published }).in("id", ids).select("id");
    setPublishBusy(null);
    if (error) return setError(error.message);
    if (!data || data.length !== ids.length) {
      // The database refused the change without an error (usually an expired sign-in).
      return setError(
        "That change was NOT saved, so participants won't see it. Sign out, sign in again and retry."
      );
    }
    setMatches((list) => list.map((x) => (ids.includes(x.id) ? { ...x, published } : x)));
  }

  async function toggleStatus() {
    if (!tournament) return;
    const status = tournament.status === "completed" ? "active" : "completed";
    const { error } = await getSupabase().from("tournaments").update({ status }).eq("id", tournament.id);
    if (error) return setError(error.message);
    setTournament({ ...tournament, status });
  }

  async function deleteTournament() {
    if (!tournament) return;
    if (!window.confirm(`Delete "${tournament.name}" and all its results? This cannot be undone.`)) return;
    const { error } = await getSupabase().from("tournaments").delete().eq("id", tournament.id);
    if (error) return setError(error.message);
    router.replace("/admin");
  }

  async function copyLink() {
    try {
      if (navigator.share) {
        await navigator.share({ title: tournament?.name, url: shareUrl });
        return;
      }
      await navigator.clipboard.writeText(shareUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      /* user cancelled share */
    }
  }

  function exportResults() {
    if (!tournament) return;
    const rows = [["Round", "Home", "Home score", "Away score", "Away", "Played", "Published"]];
    for (const m of matches) {
      rows.push([
        String(m.round),
        names[m.home_team_id],
        m.played ? String(m.home_score) : "",
        m.played ? String(m.away_score) : "",
        names[m.away_team_id],
        m.played ? "yes" : "no",
        m.published ? "yes" : "no",
      ]);
    }
    download(`${tournament.slug}-results.csv`, rows.map((r) => r.map(csvCell).join(",")).join("\n"));
  }

  function exportTable() {
    if (!tournament) return;
    const rows = [["Pos", "Team", "P", "W", "D", "L", "GF", "GA", "GD", "Pts"]];
    for (const r of standings) {
      rows.push([r.rank, r.name, r.played, r.won, r.drawn, r.lost, r.gf, r.ga, r.gd, r.points].map(String));
    }
    download(`${tournament.slug}-standings.csv`, rows.map((r) => r.map(csvCell).join(",")).join("\n"));
  }

  if (!ready) return <p className="p-6 text-gray-500">Loading…</p>;
  if (!tournament) {
    return (
      <main className="p-6">
        <p className="text-red-700">{error ?? "Tournament not found."}</p>
        <Link href="/admin" className="text-green-700">
          ← Back
        </Link>
      </main>
    );
  }

  return (
    <main className="mx-auto max-w-2xl px-4 py-6">
      <Link href="/admin" className="text-sm text-green-700">
        ← All tournaments
      </Link>
      <div className="mt-2 flex items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">{tournament.name}</h1>
          <p className="text-sm text-gray-500">
            {playedCount} of {matches.length} matches played ·{" "}
            {tournament.status === "completed" ? "Completed" : "Active"}
          </p>
        </div>
      </div>

      <section className="mt-4 rounded-xl border border-green-900/10 bg-white p-3 shadow-sm">
        <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-500">Link for participants (view only)</p>
        <div className="flex gap-2">
          <input
            readOnly
            value={shareUrl}
            onFocus={(e) => e.currentTarget.select()}
            className="min-w-0 flex-1 rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-sm"
          />
          <button onClick={copyLink} className="rounded-lg bg-green-700 px-4 py-2 text-sm font-semibold text-white">
            {copied ? "Copied" : "Share"}
          </button>
          <a
            href={shareUrl}
            target="_blank"
            rel="noreferrer"
            className="rounded-lg border border-gray-300 px-3 py-2 text-sm font-medium"
          >
            Preview
          </a>
        </div>
      </section>

      {error && <p className="mt-4 rounded-lg bg-red-50 p-3 text-sm text-red-700">{error}</p>}

      <div className="mt-5 grid grid-cols-2 rounded-xl bg-gray-200/70 p-1 text-sm font-medium">
        {(["fixtures", "table"] as const).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`rounded-lg py-2 ${tab === t ? "bg-white shadow-sm" : "text-gray-600"}`}
          >
            {t === "fixtures" ? "Matches & scores" : "Standings"}
          </button>
        ))}
      </div>

      {tab === "table" ? (
        <div className="mt-4">
          {matches.some((m) => m.played && !m.published) && (
            <p className="mb-2 rounded-lg bg-amber-50 p-2.5 text-xs text-amber-800">
              Admin view: this table includes results you haven&apos;t published yet. Participants only see published
              matches.
            </p>
          )}
          <StandingsTable rows={standings} />
        </div>
      ) : (
        <div className="mt-4 space-y-4">
          <div className="rounded-xl border border-green-900/10 bg-white p-3 shadow-sm">
            <div className="flex items-start justify-between gap-3">
              <div className="text-sm">
                <p className="font-semibold">Rounds shown to participants</p>
                <p className="text-xs text-gray-500">
                  {rounds.filter(([, l]) => l.every((m) => m.published)).length} of {rounds.length} visible. Everything
                  is hidden until you tick a round.
                </p>
              </div>
              <div className="flex shrink-0 gap-2 text-xs font-semibold">
                <button
                  onClick={() =>
                    setPublished(
                      "all",
                      matches.map((m) => m.id),
                      true
                    )
                  }
                  disabled={publishBusy === "all" || matches.every((m) => m.published)}
                  className="rounded-lg bg-green-700 px-3 py-2 text-white disabled:opacity-40"
                >
                  Tick all
                </button>
                <button
                  onClick={() =>
                    setPublished(
                      "all",
                      matches.map((m) => m.id),
                      false
                    )
                  }
                  disabled={publishBusy === "all" || !matches.some((m) => m.published)}
                  className="rounded-lg border border-gray-300 bg-white px-3 py-2 text-gray-700 disabled:opacity-40"
                >
                  Clear all
                </button>
              </div>
            </div>
            <div className="mt-3 grid grid-cols-5 gap-2 sm:grid-cols-8">
              {rounds.map(([round, list]) => {
                const all = list.every((m) => m.published);
                const some = list.some((m) => m.published);
                return (
                  <label
                    key={round}
                    className={`flex cursor-pointer flex-col items-center gap-1.5 rounded-lg border py-2 ${
                      all ? "border-green-700 bg-green-50" : "border-gray-200 bg-white"
                    }`}
                  >
                    <span className="text-base font-bold">{round}</span>
                    <input
                      type="checkbox"
                      aria-label={`Show round ${round} to participants`}
                      checked={all}
                      ref={(el) => {
                        if (el) el.indeterminate = some && !all;
                      }}
                      disabled={publishBusy === `round-${round}`}
                      onChange={() =>
                        setPublished(
                          `round-${round}`,
                          list.map((m) => m.id),
                          !all
                        )
                      }
                      className="h-5 w-5 cursor-pointer accent-green-700"
                    />
                  </label>
                );
              })}
            </div>
          </div>
          {rounds.map(([round, list]) => (
            <section key={round} className="overflow-hidden rounded-xl border border-green-900/10 bg-white shadow-sm">
              <div className="flex items-center justify-between gap-2 bg-green-50 px-3 py-2">
                <h3 className="text-xs font-semibold uppercase tracking-wide text-green-800">Round {round}</h3>
                <span
                  className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${
                    list.every((m) => m.published)
                      ? "bg-green-100 text-green-800"
                      : list.some((m) => m.published)
                        ? "bg-amber-100 text-amber-800"
                        : "bg-gray-100 text-gray-600"
                  }`}
                >
                  {list.every((m) => m.published) ? "Visible" : list.some((m) => m.published) ? "Partly visible" : "Hidden"}
                </span>
              </div>
              <ul>
                {list.map((m) => {
                  const d = drafts[m.id] ?? { home: "", away: "" };
                  const dirty =
                    d.home !== (m.home_score === null ? "" : String(m.home_score)) ||
                    d.away !== (m.away_score === null ? "" : String(m.away_score));
                  return (
                    <li key={m.id} className="border-t border-gray-100 px-3 py-3">
                      <div className="grid grid-cols-[1fr_auto_auto_auto_1fr] items-center gap-2 text-sm">
                        <span className="truncate text-right font-medium">{names[m.home_team_id]}</span>
                        <input
                          inputMode="numeric"
                          aria-label={`${names[m.home_team_id]} score`}
                          value={d.home}
                          onChange={(e) => setDraft(m.id, "home", e.target.value)}
                          className="h-10 w-12 rounded-lg border border-gray-300 text-center text-base font-bold outline-none focus:border-green-600"
                        />
                        <span className="text-gray-400">-</span>
                        <input
                          inputMode="numeric"
                          aria-label={`${names[m.away_team_id]} score`}
                          value={d.away}
                          onChange={(e) => setDraft(m.id, "away", e.target.value)}
                          className="h-10 w-12 rounded-lg border border-gray-300 text-center text-base font-bold outline-none focus:border-green-600"
                        />
                        <span className="truncate font-medium">{names[m.away_team_id]}</span>
                      </div>
                      <div className="mt-2 flex flex-wrap items-center gap-2 text-xs">
                        <button
                          onClick={() => setPublished(m.id, [m.id], !m.published)}
                          disabled={publishBusy === m.id}
                          className={`rounded-full px-2.5 py-1 font-medium disabled:opacity-50 ${
                            m.published ? "bg-green-100 text-green-800" : "bg-gray-100 text-gray-600"
                          }`}
                        >
                          {m.published ? "● Visible to participants" : "○ Hidden · tap to publish"}
                        </button>
                        {m.played && !dirty && <span className="text-green-700">✓ Saved</span>}
                        <div className="ml-auto flex items-center gap-3">
                          {m.played && (
                            <button onClick={() => clearResult(m)} disabled={savingId === m.id} className="text-gray-500">
                              Clear
                            </button>
                          )}
                          <button
                            onClick={() => saveResult(m)}
                            disabled={savingId === m.id || (m.played && !dirty)}
                            className="rounded-lg border border-green-700 px-3 py-1.5 font-semibold text-green-800 disabled:opacity-40"
                          >
                            {savingId === m.id ? "Saving…" : "Save"}
                          </button>
                          {!m.published && (
                            <button
                              onClick={() => saveResult(m, true)}
                              disabled={savingId === m.id}
                              className="rounded-lg bg-green-700 px-3 py-1.5 font-semibold text-white disabled:opacity-40"
                            >
                              Save & publish
                            </button>
                          )}
                        </div>
                      </div>
                    </li>
                  );
                })}
              </ul>
            </section>
          ))}
        </div>
      )}

      <section className="mt-8 space-y-2 border-t border-gray-200 pt-5 text-sm">
        <div className="grid grid-cols-2 gap-2">
          <button onClick={exportResults} className="rounded-xl border border-gray-300 bg-white px-3 py-2.5 font-medium">
            Export results (CSV)
          </button>
          <button onClick={exportTable} className="rounded-xl border border-gray-300 bg-white px-3 py-2.5 font-medium">
            Export table (CSV)
          </button>
        </div>
        <button onClick={toggleStatus} className="w-full rounded-xl border border-gray-300 bg-white px-3 py-2.5 font-medium">
          {tournament.status === "completed" ? "Reopen tournament" : "Mark as completed (keep for reference)"}
        </button>
        <button onClick={deleteTournament} className="w-full px-3 py-2.5 text-red-600">
          Delete tournament
        </button>
      </section>
    </main>
  );
}
