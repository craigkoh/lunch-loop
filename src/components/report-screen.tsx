"use client";

import Link from "next/link";
import { useRefreshOnFocus } from "@/lib/use-refresh-on-focus";
import { useEffect, useMemo, useState } from "react";
import { AppFrame, EmptyState } from "./app-frame";
import { RestaurantDetailsDialog } from "./restaurant-details-dialog";
import type { Restaurant } from "@/lib/types";
import { createClient } from "@/lib/supabase/client";
import {
  getGroupContext,
  getGroupMembers,
  type GroupContext,
  type GroupMemberRecord,
} from "@/lib/supabase/group";

type Round = {
  id: string;
  suggester_id: string;
  final_restaurant_id: string | null;
  scheduled_for: string | null;
  completed_at: string | null;
};
type Candidate = { id: string; session_id: string; restaurant_id: string };
type Veto = { candidate_id: string; user_id: string };

function dateLabel(value: string | null | undefined, timeZone: string) {
  return value
    ? new Intl.DateTimeFormat(undefined, { month: "short", day: "numeric", year: "numeric", timeZone }).format(new Date(value))
    : "";
}

function plural(count: number, one: string, many: string) {
  return `${count} ${count === 1 ? one : many}`;
}

export function ReportScreen() {
  const [context, setContext] = useState<GroupContext | null>(null);
  const [members, setMembers] = useState<GroupMemberRecord[]>([]);
  const [restaurants, setRestaurants] = useState<Restaurant[]>([]);
  const [rounds, setRounds] = useState<Round[]>([]);
  const [candidates, setCandidates] = useState<Candidate[]>([]);
  const [vetoes, setVetoes] = useState<Veto[]>([]);
  const [detail, setDetail] = useState<Restaurant | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [downloading, setDownloading] = useState(false);
  const [downloadMessage, setDownloadMessage] = useState("");

  // Fresh data when the app comes back into view (no Refresh button).
  const [reloadKey, setReloadKey] = useState(0);
  useRefreshOnFocus(() => setReloadKey((key) => key + 1));
  useEffect(() => {
    async function load() {
      try {
        const loopContext = await getGroupContext();
        const supabase = createClient();
        const [roster, restaurantResult, roundResult] = await Promise.all([
          getGroupMembers(loopContext.groupId),
          supabase.from("restaurants").select("*").eq("group_id", loopContext.groupId),
          supabase
            .from("lunch_sessions")
            .select("id, suggester_id, final_restaurant_id, scheduled_for, completed_at")
            .eq("group_id", loopContext.groupId)
            .eq("status", "completed")
            .order("scheduled_for", { ascending: true }),
        ]);
        if (restaurantResult.error) throw restaurantResult.error;
        if (roundResult.error) throw roundResult.error;
        const completed = (roundResult.data ?? []) as Round[];
        const candidateResult = completed.length
          ? await supabase
              .from("lunch_session_candidates")
              .select("id, session_id, restaurant_id")
              .in("session_id", completed.map((round) => round.id))
          : { data: [], error: null };
        if (candidateResult.error) throw candidateResult.error;
        const vetoResult = candidateResult.data?.length
          ? await supabase
              .from("vetoes")
              .select("candidate_id, user_id")
              .in("candidate_id", candidateResult.data.map((candidate) => candidate.id))
          : { data: [], error: null };
        if (vetoResult.error) throw vetoResult.error;
        setContext(loopContext);
        // Quiet usage note for future reporting; never blocks the report.
        void supabase.rpc("log_loop_report_view", { target_group: loopContext.groupId }).then(() => undefined, () => undefined);
        setMembers(roster);
        setRestaurants((restaurantResult.data ?? []) as Restaurant[]);
        setRounds(completed);
        setCandidates((candidateResult.data ?? []) as Candidate[]);
        setVetoes((vetoResult.data ?? []) as Veto[]);
      } catch (loadError) {
        setError(loadError instanceof Error ? loadError.message : "The loop report could not be loaded.");
      } finally {
        setLoading(false);
      }
    }
    void load();
  }, [reloadKey]);

  const timeZone = context?.timeZone ?? "America/Chicago";
  const report = useMemo(() => {
    const restaurantById = new Map(restaurants.map((restaurant) => [restaurant.id, restaurant]));
    const memberName = new Map(members.map((member) => [member.user_id, member.display_name]));
    // Count wins from the lunches themselves so the report matches History.
    const winsByPlace = new Map<string, number>();
    const lastWinByPlace = new Map<string, string>();
    const winsBySuggester = new Map<string, number>();
    const lunchesByMonth = new Map<string, number>();
    for (const round of rounds) {
      if (round.final_restaurant_id) {
        winsByPlace.set(round.final_restaurant_id, (winsByPlace.get(round.final_restaurant_id) ?? 0) + 1);
        const when = round.scheduled_for ?? round.completed_at;
        if (when && (lastWinByPlace.get(round.final_restaurant_id) ?? "") < when) lastWinByPlace.set(round.final_restaurant_id, when);
      }
      winsBySuggester.set(round.suggester_id, (winsBySuggester.get(round.suggester_id) ?? 0) + 1);
      const when = round.scheduled_for ?? round.completed_at;
      if (when) {
        const month = new Intl.DateTimeFormat(undefined, { month: "long", year: "numeric", timeZone }).format(new Date(when));
        lunchesByMonth.set(month, (lunchesByMonth.get(month) ?? 0) + 1);
      }
    }
    const candidateRestaurant = new Map(candidates.map((candidate) => [candidate.id, candidate.restaurant_id]));
    const vetoesByPlace = new Map<string, number>();
    const vetoesByMember = new Map<string, number>();
    for (const veto of vetoes) {
      const placeId = candidateRestaurant.get(veto.candidate_id);
      if (placeId) vetoesByPlace.set(placeId, (vetoesByPlace.get(placeId) ?? 0) + 1);
      vetoesByMember.set(veto.user_id, (vetoesByMember.get(veto.user_id) ?? 0) + 1);
    }
    const topPlaces = [...winsByPlace.entries()]
      .map(([id, wins]) => ({ restaurant: restaurantById.get(id), wins, lastWon: lastWinByPlace.get(id) ?? null }))
      .filter((row): row is { restaurant: Restaurant; wins: number; lastWon: string | null } => Boolean(row.restaurant))
      .sort((a, b) => b.wins - a.wins || (b.lastWon ?? "").localeCompare(a.lastWon ?? "") || a.restaurant.name.localeCompare(b.restaurant.name))
      .slice(0, 5);
    const suggesters = [...winsBySuggester.entries()]
      .map(([id, count]) => ({ name: memberName.get(id) ?? "A former member", count }))
      .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name));
    const mostVetoed = [...vetoesByPlace.entries()]
      .map(([id, count]) => ({ restaurant: restaurantById.get(id), count }))
      .filter((row): row is { restaurant: Restaurant; count: number } => Boolean(row.restaurant))
      .sort((a, b) => b.count - a.count || a.restaurant.name.localeCompare(b.restaurant.name))[0];
    const busiestMonth = [...lunchesByMonth.entries()].sort((a, b) => b[1] - a[1])[0];
    const cuisines = new Map<string, number>();
    for (const round of rounds) {
      const cuisine = restaurantById.get(round.final_restaurant_id ?? "")?.cuisine;
      if (cuisine) cuisines.set(cuisine, (cuisines.get(cuisine) ?? 0) + 1);
    }
    const topCuisine = [...cuisines.entries()].sort((a, b) => b[1] - a[1])[0];
    const activePlaces = restaurants.filter((restaurant) => !restaurant.never_again);
    const waitingForFirstWin = activePlaces.filter((restaurant) => !winsByPlace.has(restaurant.id)).length;
    const first = rounds[0];
    const facts: string[] = [];
    if (first) {
      const firstPlace = restaurantById.get(first.final_restaurant_id ?? "");
      if (firstPlace) facts.push(`The very first winner was ${firstPlace.name} on ${dateLabel(first.scheduled_for ?? first.completed_at, timeZone)}.`);
    }
    if (busiestMonth && busiestMonth[1] >= 2 && lunchesByMonth.size >= 2) facts.push(`${busiestMonth[0]} was the busiest month, with ${busiestMonth[1]} lunches.`);
    if (topCuisine && topCuisine[1] >= 2) facts.push(`${topCuisine[0]} has won ${topCuisine[1]} lunches, more than any other cuisine.`);
    if (mostVetoed && mostVetoed.count >= 2) facts.push(`${mostVetoed.restaurant.name} has been vetoed ${mostVetoed.count} times. Tough crowd.`);
    if (waitingForFirstWin >= 2) facts.push(`${waitingForFirstWin} places on the list are still waiting for their first win.`);
    return {
      lunches: rounds.length,
      places: activePlaces.length,
      differentWinners: winsByPlace.size,
      vetoCount: vetoes.length,
      topPlaces,
      suggesters,
      vetoers: [...vetoesByMember.entries()]
        .map(([id, count]) => ({ name: memberName.get(id) ?? "A former member", count }))
        .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name)),
      firstDate: first ? first.scheduled_for ?? first.completed_at : null,
      facts,
    };
  }, [candidates, members, restaurants, rounds, timeZone, vetoes]);

  async function downloadCsv() {
    if (!context || downloading) return;
    setDownloading(true);
    setDownloadMessage("");
    try {
      const response = await fetch("/api/loops/export", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ groupId: context.groupId }),
      });
      if (!response.ok) {
        const payload = (await response.json().catch(() => null)) as { error?: string } | null;
        throw new Error(payload?.error ?? "The download did not work. Please try again.");
      }
      const blob = await response.blob();
      const disposition = response.headers.get("Content-Disposition") ?? "";
      const fileName = /filename="([^"]+)"/.exec(disposition)?.[1] ?? "lunch-loop.csv";
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = fileName;
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);
      setDownloadMessage("Downloaded. Open it in Excel, Numbers, or Google Sheets.");
    } catch (downloadError) {
      setDownloadMessage(downloadError instanceof Error ? downloadError.message : "The download did not work.");
    } finally {
      setDownloading(false);
    }
  }

  const memberName = new Map(members.map((member) => [member.user_id, member.display_name]));
  const maxSuggester = Math.max(1, ...report.suggesters.map((row) => row.count));

  return (
    <AppFrame>
      <p className="text-sm font-medium text-accent-strong">Loop report</p>
      <h1 className="mt-1 text-[28px] font-bold leading-tight tracking-tight md:text-[36px]">{context?.groupName ?? "Your Lunch Loop"}</h1>
      <p className="mt-2 text-stone-600">
        {report.firstDate
          ? `Your loop’s story since ${dateLabel(report.firstDate, timeZone)}.`
          : "A summary of your loop’s lunches, winners, and vetoes."}
      </p>
      {loading ? (
        <p className="mt-6 text-sm font-semibold text-stone-500">Loading your loop report…</p>
      ) : error ? (
        <div className="mt-6">
          <EmptyState emoji="📋" title="The report is unavailable">{error}</EmptyState>
        </div>
      ) : (
        <>
          {report.lunches === 0 ? (
            <div className="mt-6">
              <EmptyState emoji="📋" title="Your report fills in after the first lunch">
                {report.places > 0
                  ? `You have ${plural(report.places, "place", "places")} ready. Finish a lunch to see winners and vetoes here.`
                  : "Add a few places, then finish a lunch to see winners and vetoes here."}
              </EmptyState>
            </div>
          ) : (
            <>
              <section className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
                {[
                  { show: true, value: report.lunches, label: report.lunches === 1 ? "lunch decided" : "lunches decided", accent: true },
                  { show: report.places > 0, value: report.places, label: report.places === 1 ? "place on the list" : "places on the list" },
                  // "1 different winner" reads oddly, so wait for a second lunch.
                  { show: report.lunches >= 2, value: report.differentWinners, label: report.differentWinners === 1 ? "different winner" : "different winners" },
                  { show: report.vetoCount > 0, value: report.vetoCount, label: report.vetoCount === 1 ? "veto cast" : "vetoes cast" },
                ]
                  .filter((card) => card.show)
                  .map((card) => (
                    <div key={card.label} className={card.accent ? "ll-calm rounded-2xl p-4 [&_p:first-child]:text-accent-strong" : "rounded-2xl bg-white p-4 shadow-sm"}>
                      <p className="text-3xl font-black">{card.value}</p>
                      <p className={card.accent ? "text-sm font-bold text-orange-50" : "text-sm text-stone-500"}>{card.label}</p>
                    </div>
                  ))}
              </section>

              <section className="mt-6 rounded-3xl bg-white p-5 shadow-sm">
                <h2 className="text-lg font-black">🏆 {report.topPlaces.length === 1 ? "Winner so far" : "Top winners"}</h2>
                <ol className="mt-3 space-y-2">
                  {report.topPlaces.map((row, index) => (
                    <li key={row.restaurant.id}>
                      <button
                        type="button"
                        onClick={() => setDetail(row.restaurant)}
                        className="flex w-full items-center gap-3 rounded-2xl bg-orange-50 p-3 text-left transition hover:bg-orange-100 focus:outline-none focus:ring-2 focus:ring-orange-300"
                      >
                        <span className="w-6 shrink-0 text-center text-lg font-black text-orange-600">{index + 1}</span>
                        <span className="min-w-0 flex-1">
                          <span className="block break-words font-extrabold">{row.restaurant.name}</span>
                          <span className="block text-xs text-stone-600">
                            🏆 {plural(row.wins, "win", "wins")}
                            {row.lastWon ? ` · last won ${dateLabel(row.lastWon, timeZone)}` : ""}
                          </span>
                        </span>
                      </button>
                    </li>
                  ))}
                </ol>
              </section>

              {report.suggesters.length > 0 && (
                <section className="mt-6 rounded-3xl bg-white p-5 shadow-sm">
                  <h2 className="text-lg font-black">🙋 Lunches suggested</h2>
                  <p className="mt-1 text-sm text-stone-500">Whose picks were on the table for each lunch.</p>
                  <div className="mt-3 space-y-3">
                    {report.suggesters.map((row) => (
                      <div key={row.name}>
                        <div className="flex justify-between gap-3 text-sm font-bold">
                          <span className="break-words">{row.name}</span>
                          <span className="shrink-0 text-stone-500">{plural(row.count, "lunch", "lunches")}</span>
                        </div>
                        <div className="mt-1 h-2 overflow-hidden rounded-full bg-stone-100">
                          <div className="h-full rounded-full bg-orange-500" style={{ width: `${(row.count / maxSuggester) * 100}%` }} />
                        </div>
                      </div>
                    ))}
                  </div>
                </section>
              )}

              {report.vetoers.length > 0 && (
                <section className="mt-6 rounded-3xl bg-white p-5 shadow-sm">
                  <h2 className="text-lg font-black">✋ Vetoes by person</h2>
                  <div className="mt-3 flex flex-wrap gap-2">
                    {report.vetoers.map((row) => (
                      <span key={row.name} className="rounded-full bg-rose-50 px-3 py-1 text-sm font-bold text-rose-800">
                        {row.name}: {row.count}
                      </span>
                    ))}
                  </div>
                </section>
              )}

              {report.facts.length > 0 && (
                <section className="mt-6 rounded-3xl bg-amber-100 p-5">
                  <p className="text-sm font-bold text-amber-800">Lunch lore</p>
                  <ul className="mt-2 list-disc space-y-1 pl-5 text-stone-800">
                    {report.facts.map((fact) => (
                      <li key={fact}>{fact}</li>
                    ))}
                  </ul>
                </section>
              )}
            </>
          )}

          <section className="mt-6 rounded-3xl border border-orange-100 bg-white p-5">
            <h2 className="text-lg font-black">⬇️ Download your loop data</h2>
            <p className="mt-1 text-sm text-stone-600">
              A CSV file of this loop’s lunches: dates, who suggested, the winner, vetoes, and win counts. Places are
              listed by number with a Google Maps link. No email addresses. Only loop members can download it, up to 5
              times a day.
            </p>
            <button
              type="button"
              onClick={() => void downloadCsv()}
              disabled={downloading || !context}
              className="mt-3 rounded-xl bg-orange-500 px-4 py-2 text-sm font-black text-white transition hover:bg-orange-600 focus:outline-none focus:ring-2 focus:ring-orange-300 disabled:opacity-50"
            >
              {downloading ? "Preparing…" : "Download CSV"}
            </button>
            {downloadMessage && (
              <p role="status" className="mt-2 text-sm font-semibold text-stone-700">{downloadMessage}</p>
            )}
          </section>
          <p className="mt-6 text-sm">
            <Link href="/stats" className="font-bold text-orange-700 hover:underline">📊 See all stats</Link>
            {" · "}
            <Link href="/history" className="font-bold text-orange-700 hover:underline">🗓️ Lunch history</Link>
            {" · "}
            <Link href="/feedback?page=/report" className="font-bold text-orange-700 hover:underline">💡 Ideas?</Link>
          </p>
        </>
      )}
      <RestaurantDetailsDialog
        restaurant={detail}
        onClose={() => setDetail(null)}
        addedBy={detail?.added_by ? memberName.get(detail.added_by) : null}
        timeZone={timeZone}
      />
    </AppFrame>
  );
}
