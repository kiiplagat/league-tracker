"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { getSupabase } from "@/lib/supabase";
import BracketView from "@/components/BracketView";
import {
  champion,
  changedMatches,
  clearResult,
  generateBracket,
  isBye,
  roundName,
  setResult,
  type BracketMatch,
  type Penalties,
} from "@/lib/bracket";
import type { Team, Tournament } from "@/lib/types";

type Row = BracketMatch & { id: string };
/** Score boxes as typed: s1/s2 = normal score, p1/p2 = penalty shoot-out score. */
type Draft = { s1: string; s2: string; p1: string; p2: string };

const COLS = "id,round,position,team1_id,team2_id,score1,score2,pen1,pen2,winner_id,published";

function draftOf(m: Row): Draft {
  return {
    s1: m.score1 === null ? "" : String(m.score1),
    s2: m.score2 === null ? "" : String(m.score2),
    p1: m.pen1 === null ? "" : String(m.pen1),
    p2: m.pen2 === null ? "" : String(m.pen2),
  };
}

const draftsFrom = (ms: Row[]) => Object.fromEntries(ms.map((m) => [m.id, draftOf(m)])) as Record<string, Draft>;

export default function ManageKnockout() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();

  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [tournament, setTournament] = useState<Tournament | null>(null);
  const [teams, setTeams] = useState<Team[]>([]);
  const [matches, setMatches] = useState<Row[]>([]);
  const [drafts, setDrafts] = useState<Record<string, Draft>>({});
  const [busy, setBusy] = useState<string | null>(null);
  const [tab, setTab] = useState<"results" | "bracket">("results");
  const [copied, setCopied] = useState(false);

  const load = useCallback(async () => {
    const supabase = getSupabase();
    const [t, tm, bm] = await Promise.all([
      supabase.from("tournaments").select("*").eq("id", id).single(),
      supabase.from("teams").select("*").eq("tournament_id", id),
      supabase.from("bracket_matches").select(COLS).eq("tournament_id", id).order("round").order("position"),
    ]);
    if (t.error) throw t.error;
    if (tm.error) throw tm.error;
    if (bm.error) throw bm.error;
    if ((t.data as Tournament).type !== "knockout") {
      router.replace(`/admin/${id}`);
      return;
    }
    setTournament(t.data as Tournament);
    setTeams(tm.data as Team[]);
    const rows = bm.data as Row[];
    setMatches(rows);
    setDrafts(draftsFrom(rows));
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
  const rounds = matches.length ? Math.max(...matches.map((m) => m.round)) : 0;
  const roundList = useMemo(() => {
    const map = new Map<number, Row[]>();
    for (const m of matches) map.set(m.round, [...(map.get(m.round) ?? []), m]);
    return Array.from(map.entries())
      .sort((a, b) => a[0] - b[0])
      .map(([round, list]) => [round, [...list].sort((a, b) => a.position - b.position)] as [number, Row[]]);
  }, [matches]);
  const champId = champion(matches);
  const hasResults = matches.some((m) => m.team1_id && m.team2_id && m.winner_id);
  const shareUrl = tournament && typeof window !== "undefined" ? `${window.location.origin}/t/${tournament.slug}` : "";

  function setDraft(matchId: string, patch: Partial<Draft>) {
    setDrafts((d) => ({ ...d, [matchId]: { ...d[matchId], ...patch } }));
  }

  function digits(value: string) {
    return value === "" || /^\d{1,3}$/.test(value);
  }

  /** Save the changed matches. Verifies the database really stored every one. */
  async function persist(next: BracketMatch[], key: string): Promise<boolean> {
    const nextRows = next as Row[];
    const changed = changedMatches(matches, nextRows) as Row[];
    if (changed.length === 0) return true;
    setBusy(key);
    const supabase = getSupabase();
    const results = await Promise.all(
      changed.map((m) =>
        supabase
          .from("bracket_matches")
          .update({
            team1_id: m.team1_id,
            team2_id: m.team2_id,
            score1: m.score1,
            score2: m.score2,
            pen1: m.pen1,
            pen2: m.pen2,
            winner_id: m.winner_id,
          })
          .eq("id", m.id)
          .select("id")
      )
    );
    setBusy(null);
    const failed = results.find((r) => r.error || !r.data || r.data.length !== 1);
    if (failed) {
      setError(
        failed.error?.message ??
          "That change was NOT saved, so participants won't see it. Sign out, sign in again and retry."
      );
      await load().catch(() => {});
      return false;
    }
    setMatches(nextRows);
    setDrafts(draftsFrom(nextRows));
    return true;
  }

  function laterResultsLost(next: BracketMatch[], m: Row): number {
    return changedMatches(matches, next).filter((x) => {
      if (x.round === m.round && x.position === m.position) return false;
      const before = matches.find((o) => o.round === x.round && o.position === x.position);
      return !!before?.winner_id;
    }).length;
  }

  async function saveResult(m: Row) {
    const d = drafts[m.id];
    if (!d || d.s1 === "" || d.s2 === "") return setError("Enter both scores first.");
    setError(null);
    setNotice(null);
    let pens: Penalties | undefined;
    if (d.s1 === d.s2) {
      if (d.p1 === "" || d.p2 === "") {
        return setError("The score is level. Enter the penalty shoot-out score for both teams.");
      }
      pens = { pen1: Number(d.p1), pen2: Number(d.p2) };
    }
    let next: BracketMatch[];
    try {
      next = setResult(matches, m.round, m.position, Number(d.s1), Number(d.s2), pens);
    } catch (e) {
      return setError(e instanceof Error ? e.message : "That result is not valid.");
    }
    const lost = laterResultsLost(next, m);
    if (
      lost > 0 &&
      !window.confirm(
        `Changing this result will reset ${lost} later match result${lost === 1 ? "" : "s"} that depended on it. Continue?`
      )
    ) {
      return;
    }
    const ok = await persist(next, m.id);
    if (ok && lost > 0) setNotice(`${lost} later result${lost === 1 ? " was" : "s were"} reset. Enter ${lost === 1 ? "it" : "them"} again.`);
  }

  async function clearMatch(m: Row) {
    setError(null);
    setNotice(null);
    let next: BracketMatch[];
    try {
      next = clearResult(matches, m.round, m.position);
    } catch (e) {
      return setError(e instanceof Error ? e.message : "Could not clear that result.");
    }
    const lost = laterResultsLost(next, m);
    if (
      lost > 0 &&
      !window.confirm(
        `Clearing this result will also reset ${lost} later match result${lost === 1 ? "" : "s"}. Continue?`
      )
    ) {
      return;
    }
    await persist(next, m.id);
  }

  async function setRoundsPublished(list: number[], value: boolean, key: string) {
    const ids = matches.filter((m) => list.includes(m.round)).map((m) => m.id);
    if (ids.length === 0) return;
    setError(null);
    setBusy(key);
    const { data, error } = await getSupabase().from("bracket_matches").update({ published: value }).in("id", ids).select("id");
    setBusy(null);
    if (error) return setError(error.message);
    if (!data || data.length !== ids.length) {
      return setError("That change was NOT saved, so participants won't see it. Sign out, sign in again and retry.");
    }
    setMatches((ms) => ms.map((x) => (ids.includes(x.id) ? { ...x, published: value } : x)));
  }

  async function redraw() {
    if (hasResults) return;
    if (!window.confirm("Draw the bracket again? The teams will be shuffled into new matches.")) return;
    setError(null);
    setNotice(null);
    setBusy("redraw");
    const supabase = getSupabase();
    const visible = new Map<number, boolean>();
    for (const [round, list] of roundList) visible.set(round, list.every((m) => m.published));

    const del = await supabase.from("bracket_matches").delete().eq("tournament_id", id).select("id");
    if (del.error) {
      setBusy(null);
      return setError(del.error.message);
    }
    const rows = generateBracket(teams.map((t) => t.id)).map((m) => ({
      ...m,
      tournament_id: id,
      published: visible.get(m.round) ?? false,
    }));
    const ins = await supabase.from("bracket_matches").insert(rows);
    if (ins.error) {
      setError(`${ins.error.message}. The old bracket was removed, so tap "Draw again" once more.`);
    }
    try {
      await load();
    } catch {
      /* shown above */
    }
    setBusy(null);
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

  const realMatches = matches.filter((m) => !isBye(m));
  const decidedCount = realMatches.filter((m) => m.winner_id).length;
  const visibleRounds = roundList.filter(([, l]) => l.every((m) => m.published)).length;

  return (
    <main className="mx-auto max-w-2xl px-4 py-6">
      <Link href="/admin" className="text-sm text-green-700">
        ← All tournaments
      </Link>
      <div className="mt-2">
        <h1 className="text-2xl font-bold">{tournament.name}</h1>
        <p className="text-sm text-gray-500">
          Knockout · {teams.length} teams · {decidedCount} of {realMatches.length} matches played ·{" "}
          {tournament.status === "completed" ? "Completed" : "Active"}
        </p>
      </div>

      {champId && (
        <p className="mt-4 rounded-xl bg-green-700 p-3 text-center font-semibold text-white">
          🏆 {names[champId] ?? "?"} wins the tournament
        </p>
      )}

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
      {notice && <p className="mt-4 rounded-lg bg-amber-50 p-3 text-sm text-amber-800">{notice}</p>}

      <section className="mt-4 rounded-xl border border-green-900/10 bg-white p-3 shadow-sm">
        <div className="flex items-start justify-between gap-3">
          <div className="text-sm">
            <p className="font-semibold">Rounds shown to participants</p>
            <p className="text-xs text-gray-500">
              {visibleRounds} of {roundList.length} visible. Everything is hidden until you tick a round.
            </p>
          </div>
          <div className="flex shrink-0 gap-2 text-xs font-semibold">
            <button
              onClick={() => setRoundsPublished(roundList.map(([r]) => r), true, "all")}
              disabled={busy === "all" || visibleRounds === roundList.length}
              className="rounded-lg bg-green-700 px-3 py-2 text-white disabled:opacity-40"
            >
              Tick all
            </button>
            <button
              onClick={() => setRoundsPublished(roundList.map(([r]) => r), false, "all")}
              disabled={busy === "all" || !matches.some((m) => m.published)}
              className="rounded-lg border border-gray-300 bg-white px-3 py-2 text-gray-700 disabled:opacity-40"
            >
              Clear all
            </button>
          </div>
        </div>
        <div className="mt-3 grid grid-cols-5 gap-2 sm:grid-cols-8">
          {roundList.map(([round, list]) => {
            const all = list.every((m) => m.published);
            const some = list.some((m) => m.published);
            return (
              <label
                key={round}
                title={roundName(round, rounds)}
                className={`flex cursor-pointer flex-col items-center gap-1.5 rounded-lg border py-2 ${
                  all ? "border-green-700 bg-green-50" : "border-gray-200 bg-white"
                }`}
              >
                <span className="text-base font-bold">{round}</span>
                <input
                  type="checkbox"
                  aria-label={`Show ${roundName(round, rounds)} to participants`}
                  checked={all}
                  ref={(el) => {
                    if (el) el.indeterminate = some && !all;
                  }}
                  disabled={busy === `round-${round}`}
                  onChange={() => setRoundsPublished([round], !all, `round-${round}`)}
                  className="h-5 w-5 cursor-pointer accent-green-700"
                />
              </label>
            );
          })}
        </div>
        <p className="mt-2 text-[11px] text-gray-400">
          Round 1 is the {roundName(1, rounds)}
          {rounds > 1 ? `, round ${rounds} is the Final.` : "."}
        </p>
      </section>

      <div className="mt-5 grid grid-cols-2 rounded-xl bg-gray-200/70 p-1 text-sm font-medium">
        {(["results", "bracket"] as const).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`rounded-lg py-2 ${tab === t ? "bg-white shadow-sm" : "text-gray-600"}`}
          >
            {t === "results" ? "Enter results" : "Bracket"}
          </button>
        ))}
      </div>

      {tab === "bracket" ? (
        <div className="mt-4">
          <p className="mb-3 text-xs text-gray-500">Admin view. Participants only see the rounds you have ticked.</p>
          <BracketView matches={matches} names={names} rounds={rounds} />
        </div>
      ) : (
        <div className="mt-4 space-y-4">
          {roundList.map(([round, list]) => {
            const all = list.every((m) => m.published);
            const some = list.some((m) => m.published);
            return (
              <section key={round} className="overflow-hidden rounded-xl border border-green-900/10 bg-white shadow-sm">
                <div className="flex items-center justify-between gap-2 bg-green-50 px-3 py-2">
                  <h3 className="text-xs font-semibold uppercase tracking-wide text-green-800">
                    {roundName(round, rounds)}
                  </h3>
                  <span
                    className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${
                      all ? "bg-green-100 text-green-800" : some ? "bg-amber-100 text-amber-800" : "bg-gray-100 text-gray-600"
                    }`}
                  >
                    {all ? "Visible" : some ? "Partly visible" : "Hidden"}
                  </span>
                </div>
                <ul>
                  {list.map((m) => {
                    const t1 = m.team1_id ? names[m.team1_id] : null;
                    const t2 = m.team2_id ? names[m.team2_id] : null;
                    if (isBye(m)) {
                      return (
                        <li key={m.id} className="border-t border-gray-100 px-3 py-3 text-sm text-gray-500">
                          <span className="font-medium text-gray-800">{t1 ?? t2}</span> goes straight through (bye)
                        </li>
                      );
                    }
                    if (!m.team1_id || !m.team2_id) {
                      return (
                        <li key={m.id} className="border-t border-gray-100 px-3 py-3 text-sm text-gray-400">
                          <span className={t1 ? "font-medium text-gray-700" : "italic"}>{t1 ?? "TBD"}</span>
                          {" vs "}
                          <span className={t2 ? "font-medium text-gray-700" : "italic"}>{t2 ?? "TBD"}</span>
                          <span className="ml-2 text-xs">· waiting for the earlier matches</span>
                        </li>
                      );
                    }
                    const d = drafts[m.id] ?? { s1: "", s2: "", p1: "", p2: "" };
                    const base = draftOf(m);
                    const level = d.s1 !== "" && d.s1 === d.s2;
                    // Shoot-out boxes only count while the normal score is level.
                    const dirty =
                      d.s1 !== base.s1 ||
                      d.s2 !== base.s2 ||
                      (level && (d.p1 !== base.p1 || d.p2 !== base.p2));
                    return (
                      <li key={m.id} className="border-t border-gray-100 px-3 py-3">
                        <div className="grid grid-cols-[1fr_auto_auto_auto_1fr] items-center gap-2 text-sm">
                          <span className="truncate text-right font-medium">{t1}</span>
                          <input
                            inputMode="numeric"
                            aria-label={`${t1} score`}
                            value={d.s1}
                            onChange={(e) => digits(e.target.value) && setDraft(m.id, { s1: e.target.value })}
                            className="h-10 w-12 rounded-lg border border-gray-300 text-center text-base font-bold outline-none focus:border-green-600"
                          />
                          <span className="text-gray-400">-</span>
                          <input
                            inputMode="numeric"
                            aria-label={`${t2} score`}
                            value={d.s2}
                            onChange={(e) => digits(e.target.value) && setDraft(m.id, { s2: e.target.value })}
                            className="h-10 w-12 rounded-lg border border-gray-300 text-center text-base font-bold outline-none focus:border-green-600"
                          />
                          <span className="truncate font-medium">{t2}</span>
                        </div>

                        {level && (
                          <div className="mt-2 rounded-lg bg-amber-50 p-2 text-amber-900">
                            <p className="mb-1.5 text-xs font-medium">
                              Level score, so it goes to a penalty shoot-out. Enter how many penalties each team scored.
                              They cannot be level.
                            </p>
                            <div className="grid grid-cols-[1fr_auto_auto_auto_1fr] items-center gap-2 text-sm">
                              <span className="truncate text-right font-medium">{t1}</span>
                              <input
                                inputMode="numeric"
                                aria-label={`${t1} penalties scored`}
                                value={d.p1}
                                onChange={(e) => digits(e.target.value) && setDraft(m.id, { p1: e.target.value })}
                                className="h-10 w-12 rounded-lg border border-amber-300 bg-white text-center text-base font-bold outline-none focus:border-green-600"
                              />
                              <span className="text-amber-700">-</span>
                              <input
                                inputMode="numeric"
                                aria-label={`${t2} penalties scored`}
                                value={d.p2}
                                onChange={(e) => digits(e.target.value) && setDraft(m.id, { p2: e.target.value })}
                                className="h-10 w-12 rounded-lg border border-amber-300 bg-white text-center text-base font-bold outline-none focus:border-green-600"
                              />
                              <span className="truncate font-medium">{t2}</span>
                            </div>
                          </div>
                        )}

                        <div className="mt-2 flex flex-wrap items-center gap-2 text-xs">
                          {m.winner_id && !dirty && (
                            <span className="text-green-700">
                              ✓ {names[m.winner_id]} {round === rounds ? "wins the tournament" : "goes through"}
                              {m.pen1 !== null && m.pen2 !== null && ` (${m.pen1}-${m.pen2} on penalties)`}
                            </span>
                          )}
                          <div className="ml-auto flex items-center gap-3">
                            {m.winner_id && (
                              <button onClick={() => clearMatch(m)} disabled={busy === m.id} className="text-gray-500">
                                Clear
                              </button>
                            )}
                            <button
                              onClick={() => saveResult(m)}
                              disabled={busy === m.id || (!!m.winner_id && !dirty)}
                              className="rounded-lg bg-green-700 px-3 py-1.5 font-semibold text-white disabled:opacity-40"
                            >
                              {busy === m.id ? "Saving…" : "Save result"}
                            </button>
                          </div>
                        </div>
                      </li>
                    );
                  })}
                </ul>
              </section>
            );
          })}
        </div>
      )}

      <section className="mt-8 space-y-2 border-t border-gray-200 pt-5 text-sm">
        <button
          onClick={redraw}
          disabled={hasResults || busy === "redraw"}
          className="w-full rounded-xl border border-gray-300 bg-white px-3 py-2.5 font-medium disabled:opacity-40"
        >
          {busy === "redraw" ? "Drawing…" : "Draw again (shuffle the teams)"}
        </button>
        {hasResults && (
          <p className="text-center text-xs text-gray-400">
            Drawing again is only possible before any result is entered.
          </p>
        )}
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
