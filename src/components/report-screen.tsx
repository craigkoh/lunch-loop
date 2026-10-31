"use client";

import Link from "next/link";
import { useRefreshOnFocus } from "@/lib/use-refresh-on-focus";
import { useEffect, useMemo, useState } from "react";
import { AppFrame, EmptyState } from "./app-frame";
import { Card, ListCard, PageHeader, SectionTitle } from "./ui/card";
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
      <PageHeader eyebrow="Loop report" title={context?.groupName ?? "Your Lunch Loop"}>
        {report.firstDate
          ? `Your loop’s story since ${dateLabel(report.firstDate, timeZone)}.`
          : "A summary of your loop’s lunches, winners, and vetoes."}
      </PageHeader>
      {loading ? (
        <p className="text-[15px] text-muted">Loading your loop report…</p>
      ) : error ? (
        <EmptyState emoji="📋" title="The report is unavailable">{error}</EmptyState>
      ) : (
        <div className="space-y-8">
          {report.lunches === 0 ? (
            <EmptyState emoji="📋" title="Your report fills in after the first lunch">
              {report.places > 0
                ? `You have ${plural(report.places, "place", "places")} ready. Finish a lunch to see winners and vetoes here.`
                : "Add a few places, then finish a lunch to see winners and vetoes here."}
            </EmptyState>
          ) : (
            <>
              <Card>
                <dl className="grid grid-cols-2 gap-y-5 sm:grid-cols-4">
                  {[
                    { show: true, value: report.lunches, label: report.lunches === 1 ? "Lunch decided" : "Lunches decided" },
                    { show: report.places > 0, value: report.places, label: report.places === 1 ? "Place on the list" : "Places on the list" },
                    // "1 different winner" reads oddly, so wait for a second lunch.
                    { show: report.lunches >= 2, value: report.differentWinners, label: report.differentWinners === 1 ? "Different winner" : "Different winners" },
                    { show: report.vetoCount > 0, value: report.vetoCount, label: report.vetoCount === 1 ? "Veto cast" : "Vetoes cast" },
                  ]
                    .filter((item) => item.show)
                    .map((item, index) => (
                      <div key={item.label} className="flex flex-col-reverse">
                        <dt className="text-sm text-muted">{item.label}</dt>
                        <dd className={`text-[28px] font-bold leading-tight tracking-tight ${index === 0 ? "text-accent-strong" : ""}`}>{item.value}</dd>
                      </div>
                    ))}
                </dl>
              </Card>

              <section>
                <SectionTitle title={report.topPlaces.length === 1 ? "Winner so far" : "Top winners"} className="mb-3" />
                <ListCard>
                  {report.topPlaces.map((row, index) => (
                    <li key={row.restaurant.id}>
                      <button
                        type="button"
                        onClick={() => setDetail(row.restaurant)}
                        className="flex min-h-14 w-full items-center gap-4 px-4 py-3 text-left transition hover:bg-surface-muted"
                      >
                        <span className={`grid size-8 shrink-0 place-items-center rounded-full text-sm font-semibold ${index === 0 ? "bg-accent text-on-accent" : "bg-accent-soft text-accent-ink"}`}>{index + 1}</span>
                        <span className="min-w-0 flex-1">
                          <span className="block break-words text-[15px] font-semibold">{row.restaurant.name}</span>
                          <span className="block text-sm text-subtle">
                            {plural(row.wins, "win", "wins")}
                            {row.lastWon ? ` · last won ${dateLabel(row.lastWon, timeZone)}` : ""}
                          </span>
                        </span>
                        <span aria-hidden="true" className="text-subtle">›</span>
                      </button>
                    </li>
                  ))}
                </ListCard>
              </section>

              {(report.suggesters.length > 0 || report.vetoers.length > 0) && (
                <section>
                  <SectionTitle title="Who did what" className="mb-3" />
                  <Card className="space-y-5">
                    {report.suggesters.length > 0 && (
                      <div>
                        <h3 className="text-[15px] font-semibold">Lunches suggested</h3>
                        <p className="text-sm text-muted">Whose picks were on the table.</p>
                        <ul className="mt-3 space-y-3">
                          {report.suggesters.map((row) => (
                            <li key={row.name}>
                              <div className="flex justify-between gap-3 text-[15px]">
                                <span className="break-words">{row.name}</span>
                                <span className="shrink-0 text-muted">{plural(row.count, "lunch", "lunches")}</span>
                              </div>
                              <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-surface-muted">
                                <div className="h-full rounded-full bg-accent" style={{ width: `${(row.count / maxSuggester) * 100}%` }} />
                              </div>
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}
                    {report.vetoers.length > 0 && (
                      <div className={report.suggesters.length > 0 ? "border-t border-line pt-5" : ""}>
                        <h3 className="text-[15px] font-semibold">Vetoes by person</h3>
                        <ul className="mt-2 divide-y divide-line">
                          {report.vetoers.map((row) => (
                            <li key={row.name} className="flex justify-between gap-3 py-2 text-[15px]">
                              <span className="break-words">{row.name}</span>
                              <span className="shrink-0 text-muted">{plural(row.count, "veto", "vetoes")}</span>
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}
                  </Card>
                </section>
              )}

              {report.facts.length > 0 && (
                <section className="rounded-[var(--ll-radius-lg)] bg-accent-soft p-5">
                  <h2 className="text-[15px] font-semibold text-accent-ink">✨ Lunch lore</h2>
                  <ul className="mt-2 space-y-2 text-[15px] leading-6">
                    {report.facts.map((fact) => (
                      <li key={fact}>{fact}</li>
                    ))}
                  </ul>
                </section>
              )}
            </>
          )}

          <Card>
            <h2 className="text-[17px] font-semibold">Download your loop data</h2>
            <p className="mt-1 text-sm leading-6 text-muted">
              A CSV of this loop’s lunches: dates, who suggested, the winner, vetoes, and win counts. Places come with a
              Google Maps link. No email addresses. Members can download it up to 5 times a day.
            </p>
            <button
              type="button"
              onClick={() => void downloadCsv()}
              disabled={downloading || !context}
              className="mt-4 inline-flex min-h-11 items-center rounded-[var(--ll-radius-md)] border border-line bg-surface px-4 text-[15px] font-semibold text-ink transition hover:bg-surface-muted disabled:opacity-50"
            >
              {downloading ? "Preparing…" : "Download CSV"}
            </button>
            {downloadMessage && (
              <p role="status" className="mt-2 text-sm text-muted">{downloadMessage}</p>
            )}
          </Card>
          <p className="flex flex-wrap gap-x-5 gap-y-1 text-[15px]">
            <Link href="/stats" className="inline-flex min-h-11 items-center font-medium text-accent-strong hover:underline">Stats →</Link>
            <Link href="/history" className="inline-flex min-h-11 items-center font-medium text-accent-strong hover:underline">History →</Link>
            <Link href="/feedback?page=/report" className="inline-flex min-h-11 items-center font-medium text-accent-strong hover:underline">Ideas?</Link>
          </p>
        </div>
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
