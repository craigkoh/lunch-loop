"use client";

import Link from "next/link";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { AppFrame } from "./app-frame";
import { GroupSetup } from "./group-setup";
import { NoLoopWelcome } from "./no-loop-welcome";
import { RestaurantDetailsDialog } from "./restaurant-details-dialog";
import { RestaurantSearchFilters } from "./restaurant-database-browser";
import { QuickAddPlacePanel } from "./quick-add-place-panel";
import type { Restaurant } from "@/lib/types";
import { hoursAtPlannedLunch } from "@/lib/location-hours";
import { PickValueNudge } from "./pick-value-nudge";
import { receiptDate } from "@/lib/donation";
import { offerFeedbackPrompt } from "@/lib/feedback-prompt";
import { createClient, hasSupabaseEnv } from "@/lib/supabase/client";
import {
  getLunchLoopHomeSnapshot,
  type GroupContext,
  type GroupMemberRecord,
} from "@/lib/supabase/group";

type CurrentRound = {
  id: string;
  status: "active" | "chosen";
  scheduled_for: string;
  final_restaurant_id: string | null;
  suggester_id: string;
};
type Candidate = { id: string; restaurant_id: string };
type Veto = { candidate_id: string; user_id: string };
type Strategy =
  "random" | "stale" | "least" | "fresh" | "rated" | "newest" | "manual";

const placesPerSelectionPage = 6;

async function withClientTimeout<T>(request: Promise<T>, timeoutMs: number, message: string) {
  let timeoutId: number | undefined;
  try {
    return await Promise.race([
      request,
      new Promise<T>((_, reject) => {
        timeoutId = window.setTimeout(() => reject(new Error(message)), timeoutMs);
      }),
    ]);
  } finally {
    if (timeoutId !== undefined) window.clearTimeout(timeoutId);
  }
}

function formatLunchTime(value: string, timeZone = "America/Chicago") {
  return new Intl.DateTimeFormat(undefined, {
    weekday: "long",
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZone,
  }).format(new Date(value));
}
function shortDate(value?: string | null, timeZone = "America/Chicago") {
  return value
    ? new Intl.DateTimeFormat(undefined, {
        weekday: "short",
        month: "short",
        day: "numeric",
        year: "numeric",
        timeZone,
      }).format(new Date(value))
    : null;
}
function zonedParts(date: Date, timeZone = "America/Chicago") {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(date);
  const read = (type: Intl.DateTimeFormatPartTypes) =>
    Number(parts.find((part) => part.type === type)?.value ?? 0);
  return { year: read("year"), month: read("month"), day: read("day"), hour: read("hour"), minute: read("minute") };
}
function localDate(date: Date, timeZone = "America/Chicago") {
  const parts = zonedParts(date, timeZone);
  return `${parts.year}-${String(parts.month).padStart(2, "0")}-${String(parts.day).padStart(2, "0")}`;
}
function splitTime(value: string, timeZone = "America/Chicago") {
  const date = new Date(value);
  const parts = zonedParts(date, timeZone);
  return { date: localDate(date, timeZone), time: `${String(parts.hour).padStart(2, "0")}:${String(parts.minute).padStart(2, "0")}` };
}
function zonedDateTime(dateValue: string, timeValue: string, timeZone = "America/Chicago") {
  const [year, month, day] = dateValue.split("-").map(Number);
  const [hour, minute] = timeValue.split(":").map(Number);
  const target = Date.UTC(year, month - 1, day, hour, minute);
  const offsetAt = (instant: Date) => {
    const parts = zonedParts(instant, timeZone);
    return Date.UTC(parts.year, parts.month - 1, parts.day, parts.hour, parts.minute) - instant.getTime();
  };
  let instant = target - offsetAt(new Date(target));
  instant = target - offsetAt(new Date(instant));
  return new Date(instant);
}
function defaultLunchTime(timeZone = "America/Chicago") {
  const now = new Date();
  const today = localDate(now, timeZone);
  let lunch = zonedDateTime(today, "12:00", timeZone);
  if (lunch <= now) {
    const [year, month, day] = today.split("-").map(Number);
    const tomorrow = new Date(Date.UTC(year, month - 1, day + 1));
    lunch = zonedDateTime(localDate(tomorrow, "UTC"), "12:00", timeZone);
  }
  return splitTime(lunch.toISOString(), timeZone);
}
function mealNameFor(date: Date, timeZone = "America/Chicago") {
  const hour = Number(
    new Intl.DateTimeFormat("en-US", {
      hour: "numeric",
      hourCycle: "h23",
      timeZone,
    }).format(date),
  );
  return hour >= 16 ? "dinner" : "lunch";
}
function choose(
  strategy: Exclude<Strategy, "manual">,
  places: Restaurant[],
  count: number,
) {
  if (strategy === "least")
    return [...places]
      .sort(
        (a, b) => a.visit_count - b.visit_count || a.name.localeCompare(b.name),
      )
      .slice(0, count);
  if (strategy === "stale")
    return [...places]
      .sort((a, b) =>
        (a.last_visited_at ?? "1900").localeCompare(
          b.last_visited_at ?? "1900",
        ),
      )
      .slice(0, count);
  if (strategy === "fresh") {
    const neverPicked = places.filter((place) => place.visit_count === 0);
    if (neverPicked.length >= count)
      return [...neverPicked].sort(() => Math.random() - 0.5).slice(0, count);
    return [
      ...neverPicked,
      ...places
        .filter((place) => place.visit_count > 0)
        .sort(
          (a, b) =>
            a.visit_count - b.visit_count || a.name.localeCompare(b.name),
        ),
    ].slice(0, count);
  }
  if (strategy === "rated")
    return [...places]
      .sort(
        (a, b) =>
          (b.rating ?? 0) - (a.rating ?? 0) || a.name.localeCompare(b.name),
      )
      .slice(0, count);
  if (strategy === "newest")
    return [...places]
      .sort(
        (a, b) =>
          (b.created_at ?? "").localeCompare(a.created_at ?? "") ||
          a.name.localeCompare(b.name),
      )
      .slice(0, count);
  return [...places].sort(() => Math.random() - 0.5).slice(0, count);
}

export function HomeScreen() {
  const initialTime = defaultLunchTime();
  const [context, setContext] = useState<GroupContext | null>(null);
  const [members, setMembers] = useState<GroupMemberRecord[]>([]);
  const [restaurants, setRestaurants] = useState<Restaurant[]>([]);
  const [completedCount, setCompletedCount] = useState(0);
  const [lastLunch, setLastLunch] = useState<{
    restaurant: Restaurant;
    scheduled_for: string;
  } | null>(null);
  const [current, setCurrent] = useState<CurrentRound | null>(null);
  const [candidates, setCandidates] = useState<Candidate[]>([]);
  const [vetoes, setVetoes] = useState<Veto[]>([]);
  const [manualSelection, setManualSelection] = useState<string[]>([]);
  const [search, setSearch] = useState("");
  const [browseOrder, setBrowseOrder] = useState<string[]>([]);
  const [cuisineFilter, setCuisineFilter] = useState("");
  const [addedByFilter, setAddedByFilter] = useState("");
  const [browsePage, setBrowsePage] = useState(1);
  const [detailRestaurant, setDetailRestaurant] = useState<Restaurant | null>(
    null,
  );
  const [quickAddOpen, setQuickAddOpen] = useState(false);
  const [lunchDate, setLunchDate] = useState(initialTime.date);
  const [lunchTime, setLunchTime] = useState(initialTime.time);
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [loadNonce, setLoadNonce] = useState(0);
  const [reconnecting, setReconnecting] = useState(false);
  const [slowLoading, setSlowLoading] = useState(false);
  const [needsInvite, setNeedsInvite] = useState(false);
  const syncInFlight = useRef(false);
  const initialSnapshotLoaded = useRef(false);
  const needsInviteRef = useRef(false);
  const retryAttempts = useRef(0);
  const retryTimer = useRef<number | null>(null);
  // Live refreshes keep the rest of the crew up to date. Keep them from
  // replacing a picker’s in-progress choices or time before that person saves.
  const loadedRoundId = useRef<string | null | undefined>(undefined);
  const selectionDraftDirty = useRef(false);
  const scheduleDraftDirty = useRef(false);

  const load = useCallback(async () => {
    let retryScheduled = false;
    if (syncInFlight.current) return;
    if (needsInviteRef.current) {
      setLoading(false);
      return;
    }
    syncInFlight.current = true;
    if (!hasSupabaseEnv()) {
      setLoading(false);
      syncInFlight.current = false;
      return;
    }
    setError("");
    try {
      const supabase = createClient();
      const { data: sessionData, error: sessionError } = await withClientTimeout(
        supabase.auth.getSession(),
        6_000,
        "Your sign-in is taking longer than expected.",
      );
      if (sessionError || !sessionData.session) throw new Error("Your sign-in is still reconnecting.");

      // A restored PWA/browser session can briefly hold an access token that
      // is about to expire. Refresh it before the authorized snapshot call
      // rather than spending several retries on the same token.
      if ((sessionData.session.expires_at ?? 0) * 1_000 <= Date.now() + 60_000) {
        const { data: refreshed, error: refreshError } = await withClientTimeout(
          supabase.auth.refreshSession(),
          8_000,
          "Your sign-in is taking longer than expected.",
        );
        if (refreshError || !refreshed.session) throw new Error("Your sign-in is still reconnecting.");
      }

      let snapshot;
      try {
        snapshot = await withClientTimeout(
          getLunchLoopHomeSnapshot(),
          8_000,
          "Your Lunch Loop is taking longer than expected.",
        );
      } catch (snapshotError) {
        // If the access token became stale between getSession and the RPC,
        // refresh it once before using the normal bounded retry flow.
        const { data: refreshed, error: refreshError } = await withClientTimeout(
          supabase.auth.refreshSession(),
          8_000,
          "Your sign-in is taking longer than expected.",
        );
        if (refreshError || !refreshed.session) throw snapshotError;
        snapshot = await withClientTimeout(
          getLunchLoopHomeSnapshot(),
          8_000,
          "Your Lunch Loop is taking longer than expected.",
        );
      }
      const group = snapshot.context;
      const round = snapshot.current as CurrentRound | null;
      const roundCandidates = snapshot.candidates as Candidate[];
      const roundVetoes = snapshot.vetoes as Veto[];
      const places = snapshot.restaurants as Restaurant[];
      const latest = snapshot.last_lunch;
      const latestRestaurant = latest?.restaurant_id
        ? places.find(
            (restaurant) => restaurant.id === latest.restaurant_id,
          )
        : undefined;
      setContext(group);
      setNeedsInvite(false);
      needsInviteRef.current = false;
      setMembers(snapshot.members);
      setRestaurants(places);
      setCompletedCount(snapshot.completed_count);
      setCurrent(round);
      setCandidates(roundCandidates);
      setVetoes(roundVetoes);
      if (!round) {
        setBrowseOrder((previous) => {
          const placeIds = new Set(places.map((restaurant) => restaurant.id));
          const retained = previous.filter((restaurantId) =>
            placeIds.has(restaurantId),
          );
          const retainedIds = new Set(retained);
          const additions = places
            .filter((restaurant) => !retainedIds.has(restaurant.id))
            .sort(() => Math.random() - 0.5)
            .map((restaurant) => restaurant.id);
          return [...retained, ...additions];
        });
      }
      const nextRoundId = round?.id ?? null;
      const changedRounds = loadedRoundId.current !== nextRoundId;
      const choicesAreEditable =
        round?.status === "active" &&
        round.suggester_id === group.userId &&
        roundVetoes.length === 0;

      if (changedRounds) {
        loadedRoundId.current = nextRoundId;
        selectionDraftDirty.current = false;
        scheduleDraftDirty.current = false;
        if (round) {
          const values = splitTime(round.scheduled_for, group.timeZone);
          setLunchDate(values.date);
          setLunchTime(values.time);
          setManualSelection(
            choicesAreEditable
              ? roundCandidates.map((candidate) => candidate.restaurant_id)
              : [],
          );
        } else {
          const values = defaultLunchTime(group.timeZone);
          setLunchDate(values.date);
          setLunchTime(values.time);
          setManualSelection([]);
        }
      } else if (round) {
        if (!scheduleDraftDirty.current) {
          const values = splitTime(round.scheduled_for, group.timeZone);
          setLunchDate(values.date);
          setLunchTime(values.time);
        }
        if (!selectionDraftDirty.current) {
          setManualSelection(
            choicesAreEditable
              ? roundCandidates.map((candidate) => candidate.restaurant_id)
              : [],
          );
        }
      }
      setLastLunch(
        latestRestaurant && latest?.scheduled_for
          ? {
              restaurant: latestRestaurant,
              scheduled_for: latest.scheduled_for,
            }
          : null,
      );
      initialSnapshotLoaded.current = true;
      retryAttempts.current = 0;
      setReconnecting(false);
    } catch (loadError) {
      const loadMessage =
        loadError instanceof Error
          ? loadError.message
          : loadError &&
              typeof loadError === "object" &&
              "message" in loadError &&
              typeof loadError.message === "string"
            ? loadError.message
            : "";
      if (loadMessage.includes("Create or join an active Lunch Loop first")) {
        setNeedsInvite(true);
        needsInviteRef.current = true;
        setReconnecting(false);
        return;
      }
      if (!initialSnapshotLoaded.current && retryAttempts.current < 3) {
        const retryDelay = [500, 1_000, 2_000][retryAttempts.current] ?? 2_000;
        retryAttempts.current += 1;
        setReconnecting(true);
        retryScheduled = true;
        retryTimer.current = window.setTimeout(() => setLoadNonce((value) => value + 1), retryDelay);
      } else if (!initialSnapshotLoaded.current) {
        setError("We could not reconnect to your Lunch Loop yet. Your data is safe—please try again.");
      }
    } finally {
      if (!retryScheduled) setLoading(false);
      syncInFlight.current = false;
    }
  }, []);
  useEffect(() => {
    void load();
    return () => {
      if (retryTimer.current) window.clearTimeout(retryTimer.current);
    };
  }, [load, loadNonce]);
  useEffect(() => {
    if (!loading) {
      setSlowLoading(false);
      return;
    }
    const timer = window.setTimeout(() => setSlowLoading(true), 3_500);
    return () => window.clearTimeout(timer);
  }, [loading]);
  useEffect(() => {
    const refreshWhenVisible = () => {
      if (document.visibilityState !== "hidden") void load();
    };
    const intervalId = window.setInterval(refreshWhenVisible, 30_000);
    window.addEventListener("focus", refreshWhenVisible);
    document.addEventListener("visibilitychange", refreshWhenVisible);
    return () => {
      window.clearInterval(intervalId);
      window.removeEventListener("focus", refreshWhenVisible);
      document.removeEventListener("visibilitychange", refreshWhenVisible);
    };
  }, [load]);
  useEffect(() => {
    if (!hasSupabaseEnv()) return;
    const { data: listener } = createClient().auth.onAuthStateChange((event) => {
      if (event === "INITIAL_SESSION" || event === "SIGNED_IN" || event === "TOKEN_REFRESHED") {
        setLoadNonce((value) => value + 1);
      }
    });
    return () => listener.subscription.unsubscribe();
  }, []);
  function retryHomeLoad() {
    retryAttempts.current = 0;
    setError("");
    setReconnecting(true);
    setLoading(true);
    setLoadNonce((value) => value + 1);
  }
  useEffect(() => {
    if (!context || !hasSupabaseEnv()) return;
    const supabase = createClient();
    const channel = supabase
      .channel(`lunch-loop-live:${context.groupId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "lunch_sessions",
          filter: `group_id=eq.${context.groupId}`,
        },
        () => void load(),
      )
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "restaurants",
          filter: `group_id=eq.${context.groupId}`,
        },
        () => void load(),
      )
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "group_members",
          filter: `group_id=eq.${context.groupId}`,
        },
        () => void load(),
      );
    if (current) {
      channel
        .on(
          "postgres_changes",
          {
            event: "*",
            schema: "public",
            table: "lunch_session_candidates",
            filter: `session_id=eq.${current.id}`,
          },
          () => void load(),
        )
        .on(
          "postgres_changes",
          {
            event: "*",
            schema: "public",
            table: "vetoes",
            filter: `session_id=eq.${current.id}`,
          },
          () => void load(),
        );
    }
    channel.subscribe();
    return () => {
      void supabase.removeChannel(channel);
    };
  }, [context?.groupId, current?.id, load]);

  const available = useMemo(
    () => restaurants.filter((restaurant) => !restaurant.never_again),
    [restaurants],
  );
  const memberCount = members.length;
  const isOccasion = context?.loopType === "occasion";
  const occasionOwner = members.find((member) => member.role === "owner") ?? null;
  const nextSuggester = !isOccasion && memberCount
    ? members[completedCount % memberCount]
    : isOccasion && completedCount === 0
      ? occasionOwner
      : null;
  const suggester = members.find(
    (member) => member.user_id === current?.suggester_id,
  );
  const isCurrentSuggester = Boolean(
    context && current?.suggester_id === context.userId,
  );
  const isNextSuggester = Boolean(
    context && !current && !isOccasion && nextSuggester?.user_id === context.userId,
  );
  const canStartOccasion = Boolean(
    context &&
      !current &&
      isOccasion &&
      (completedCount > 0 || occasionOwner?.user_id === context.userId),
  );
  const canStartRound = isNextSuggester || canStartOccasion;
  const timeZone = context?.timeZone ?? "America/Chicago";
  const myVeto = context
    ? vetoes.find((veto) => veto.user_id === context.userId)
    : undefined;
  const survivors = candidates.filter(
    (candidate) => !vetoes.some((veto) => veto.candidate_id === candidate.id),
  );
  const survivorRestaurants = survivors
    .map((candidate) =>
      restaurants.find(
        (restaurant) => restaurant.id === candidate.restaurant_id,
      ),
    )
    .filter((restaurant): restaurant is Restaurant => Boolean(restaurant));
  const winner = current?.final_restaurant_id
    ? (restaurants.find(
        (restaurant) => restaurant.id === current.final_restaurant_id,
      ) ?? null)
    : survivorRestaurants.length === 1
      ? survivorRestaurants[0]
      : null;
  const myVetoRestaurant = myVeto
    ? (restaurants.find(
        (restaurant) =>
          restaurant.id ===
          candidates.find((candidate) => candidate.id === myVeto.candidate_id)
            ?.restaurant_id,
      ) ?? null)
    : null;
  const favorite = [...available].sort(
    (a, b) => b.visit_count - a.visit_count,
  )[0];
  const newestRestaurant = [...available].sort(
    (a, b) =>
      new Date(b.created_at ?? 0).getTime() -
        new Date(a.created_at ?? 0).getTime() ||
      a.name.localeCompare(b.name),
  )[0];
  const scheduleHasPassed = Boolean(
    current && new Date(current.scheduled_for) <= new Date(),
  );
  const choicesLocked = vetoes.length > 0;
  const memberNameById = useMemo(
    () =>
      new Map(members.map((member) => [member.user_id, member.display_name])),
    [members],
  );
  const eligibleVoters = members.filter(
    (member) => member.user_id !== current?.suggester_id,
  );
  const pendingVetoers = eligibleVoters.filter(
    (member) => !vetoes.some((veto) => veto.user_id === member.user_id),
  );
  const cuisines = useMemo(
    () =>
      [
        ...new Set(
          available.map((restaurant) => restaurant.cuisine || "Restaurant"),
        ),
      ].sort(),
    [available],
  );
  const filteredPlaces = useMemo(
    () =>
      available.filter(
        (restaurant) =>
          (!cuisineFilter ||
            (restaurant.cuisine || "Restaurant") === cuisineFilter) &&
          (!addedByFilter || restaurant.added_by === addedByFilter),
      ),
    [addedByFilter, available, cuisineFilter],
  );
  const plannedLunchAt = useMemo(
    () => zonedDateTime(lunchDate, lunchTime, timeZone),
    [lunchDate, lunchTime, timeZone],
  );
  const mealName = mealNameFor(plannedLunchAt, timeZone);
  const mealNameTitle = `${mealName.slice(0, 1).toUpperCase()}${mealName.slice(1)}`;
  const selectablePlaces = useMemo(
    () =>
      filteredPlaces.filter(
        (restaurant) =>
          hoursAtPlannedLunch(restaurant.hours, plannedLunchAt, timeZone).isOpen,
      ),
    [filteredPlaces, plannedLunchAt, timeZone],
  );
  const browsePosition = useMemo(
    () =>
      new Map(browseOrder.map((restaurantId, index) => [restaurantId, index])),
    [browseOrder],
  );
  const allMatchingPlaces = useMemo(() => {
    const term = search.trim().toLowerCase();
    const matches = term
      ? filteredPlaces.filter((restaurant) =>
          `${restaurant.name} ${restaurant.address} ${restaurant.cuisine ?? ""} ${memberNameById.get(restaurant.added_by ?? "") ?? ""}`
            .toLowerCase()
            .includes(term),
        )
      : filteredPlaces;
    return [...matches]
      .sort((a, b) =>
        term
          ? a.name.localeCompare(b.name)
          : (browsePosition.get(a.id) ?? Number.MAX_SAFE_INTEGER) -
            (browsePosition.get(b.id) ?? Number.MAX_SAFE_INTEGER),
      );
  }, [browsePosition, filteredPlaces, memberNameById, search]);
  const selectionPageCount = Math.max(
    1,
    Math.ceil(allMatchingPlaces.length / placesPerSelectionPage),
  );
  const currentBrowsePage = Math.min(browsePage, selectionPageCount);
  const matchingPlaces = allMatchingPlaces.slice(
    (currentBrowsePage - 1) * placesPerSelectionPage,
    currentBrowsePage * placesPerSelectionPage,
  );
  const selectedRestaurants = manualSelection
    .map((id) => available.find((restaurant) => restaurant.id === id))
    .filter((restaurant): restaurant is Restaurant => Boolean(restaurant));
  const remainingSelectionCount = Math.max(
    memberCount - manualSelection.length,
    0,
  );
  const smartFillPlaces = selectablePlaces.filter(
    (restaurant) => !manualSelection.includes(restaurant.id),
  );
  const hasClosedSelection = selectedRestaurants.some(
    (restaurant) =>
      !hoursAtPlannedLunch(restaurant.hours, plannedLunchAt, timeZone).isOpen,
  );

  async function refreshAfterQuickAdd(place: import("@/lib/types").PlaceSearchResult) {
    await load();
    setSearch(place.name);
    setBrowsePage(1);
    setMessage(`${place.name} is in your Lunch Database. Add it to this selection below if it is open at the planned ${mealName} time.`);
  }

  function scheduledFor() {
    return plannedLunchAt;
  }
  function availabilityFor(restaurant: Restaurant) {
    return hoursAtPlannedLunch(restaurant.hours, plannedLunchAt, timeZone);
  }
  function toggleChoice(restaurantId: string) {
    selectionDraftDirty.current = true;
    setManualSelection((selected) =>
      selected.includes(restaurantId)
        ? selected.filter((id) => id !== restaurantId)
        : selected.length >= memberCount
          ? selected
          : [...selected, restaurantId],
    );
  }
  function applySmartChoices(strategy: Exclude<Strategy, "manual">) {
    if (remainingSelectionCount === 0) return;
    const additions = choose(
      strategy,
      smartFillPlaces,
      remainingSelectionCount,
    ).map((restaurant) => restaurant.id);
    selectionDraftDirty.current = true;
    setManualSelection((selected) => [...selected, ...additions]);
    setSearch("");
  }
  function restaurantFacts(restaurant: Restaurant) {
    const addedBy = restaurant.added_by
      ? memberNameById.get(restaurant.added_by)
      : null;
    return (
      <span className="mt-1 block break-words text-xs leading-5 text-stone-500">
        {restaurant.visit_count}{" "}
        {restaurant.visit_count === 1 ? "pick" : "picks"} ·{" "}
        {restaurant.last_visited_at
          ? `last ${shortDate(restaurant.last_visited_at, timeZone)}`
          : "never picked"}{" "}
        · added by {addedBy ?? "a crew member"}
        {restaurant.created_at ? ` on ${shortDate(restaurant.created_at, timeZone)}` : ""}
      </span>
    );
  }

  async function startRound(strategy: Strategy, restaurantIds: string[]) {
    if (
      !context ||
      restaurantIds.length !== memberCount ||
      memberCount < 2 ||
      available.length < 2 ||
      hasClosedSelection
    )
      return;
    setBusy(true);
    setError("");
    setMessage("");
    try {
      const lunchAt = scheduledFor();
      if (lunchAt <= new Date())
        throw new Error(`Choose a ${mealName} time in the future.`);
      const { error: startError } = await createClient().rpc(
        "create_lunch_round",
        {
          target_group: context.groupId,
          restaurant_ids: restaurantIds,
          lunch_time: lunchAt.toISOString(),
        },
      );
      if (startError) throw startError;
      setMessage(
        strategy === "manual"
          ? "Your choices are ready for the group."
          : "The list picked the choices. Your group can veto now.",
      );
      await load();
    } catch (startError) {
      setError(
        startError instanceof Error
          ? startError.message
          : "Could not start this lunch round.",
      );
    } finally {
      setBusy(false);
    }
  }
  async function saveChoices() {
    if (
      !current ||
      manualSelection.length !== memberCount ||
      choicesLocked ||
      hasClosedSelection
    )
      return;
    setBusy(true);
    setError("");
    setMessage("");
    try {
      const { error: updateError } = await createClient().rpc(
        "update_lunch_round_choices",
        { target_session: current.id, restaurant_ids: manualSelection },
      );
      if (updateError) throw updateError;
      selectionDraftDirty.current = false;
      setMessage(
        "Your picks are updated. They lock as soon as the first veto lands.",
      );
      await load();
    } catch (updateError) {
      setError(
        updateError instanceof Error
          ? updateError.message
          : "Your choices could not be updated.",
      );
    } finally {
      setBusy(false);
    }
  }
  async function saveSchedule() {
    if (!current || !lunchDate || !lunchTime) return;
    setBusy(true);
    setError("");
    setMessage("");
    try {
      const lunchAt = scheduledFor();
      if (lunchAt <= new Date())
        throw new Error(`Choose a ${mealName} time in the future.`);
      const { error: updateError } = await createClient().rpc(
        "update_lunch_schedule",
        { target_session: current.id, lunch_time: lunchAt.toISOString() },
      );
      if (updateError) throw updateError;
      scheduleDraftDirty.current = false;
      setMessage(`${mealNameTitle} time updated for the crew.`);
      await load();
    } catch (updateError) {
      setError(
        updateError instanceof Error
          ? updateError.message
          : `${mealNameTitle} time could not be updated.`,
      );
    } finally {
      setBusy(false);
    }
  }
  async function veto(candidate: Candidate) {
    if (
      !context ||
      !current ||
      current.status !== "active" ||
      isCurrentSuggester ||
      myVeto
    )
      return;
    setBusy(true);
    setError("");
    setMessage("");
    try {
      const { error: vetoError } = await createClient().rpc("cast_lunch_veto", {
        target_session: current.id,
        target_candidate: candidate.id,
      });
      if (vetoError) throw vetoError;
      const remaining = survivors.filter((item) => item.id !== candidate.id);
      if (remaining.length === 1) {
        const { error: finalizeError } = await createClient().rpc(
          "finalize_lunch_session",
          {
            target_session: current.id,
            winning_restaurant: remaining[0].restaurant_id,
          },
        );
        if (finalizeError) throw finalizeError;
        setMessage(`🎉 That was the final veto — ${mealName} is decided!`);
      } else setMessage("Your one veto is in. The decision keeps moving.");
      await load();
    } catch (vetoError) {
      setError(
        vetoError instanceof Error
          ? vetoError.message
          : "Your veto could not be saved.",
      );
    } finally {
      setBusy(false);
    }
  }
  async function closeLoop() {
    if (!current || !scheduleHasPassed) return;
    if (
      !window.confirm(
        isOccasion
          ? "Finish this occasion? This records the visit. There is no next turn; any crew member can start another occasion when ready."
          : "Close this lunch loop? This records the visit and hands the next round to the next person.",
      )
    )
      return;
    setBusy(true);
    setError("");
    setMessage("");
    try {
      const { error: closeError } = await createClient().rpc(
        "close_lunch_loop",
        { target_session: current.id },
      );
      if (closeError) throw closeError;
      setMessage(
        isOccasion
          ? "Occasion complete — any crew member can start the next one when ready."
          : "Loop closed — the next picker is up.",
      );
      if (context?.userId) offerFeedbackPrompt(context.userId);
      await load();
    } catch (closeError) {
      setError(
        closeError instanceof Error
          ? closeError.message
          : "This lunch loop could not be closed.",
      );
    } finally {
      setBusy(false);
    }
  }

  const renderChoicePicker = ({
    actionLabel,
    onSave,
  }: {
    actionLabel: string;
    onSave: () => void;
  }) => (
    <div className="mt-5 rounded-2xl bg-orange-950/15 p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <p className="text-xs font-bold uppercase tracking-widest text-orange-100">
            Build your short list
          </p>
          <h2 className="mt-1 text-lg font-black">
            Choose {memberCount} different places
          </h2>
        </div>
        <span className="rounded-full bg-white px-3 py-1 text-sm font-black text-orange-800">
          {manualSelection.length}/{memberCount} picked
        </span>
      </div>
      <div className="mt-4 rounded-2xl bg-white p-3 text-stone-900">
        <div className="flex items-center justify-between gap-2">
          <p className="text-sm font-black">Your selection</p>
          {manualSelection.length > 0 && (
            <button
              type="button"
              onClick={() => {
                selectionDraftDirty.current = true;
                setManualSelection([]);
              }}
              className="text-xs font-bold text-rose-700 underline"
            >
              Clear all
            </button>
          )}
        </div>
        {selectedRestaurants.length ? (
          <div className="mt-3 grid gap-2 sm:grid-cols-2">
            {selectedRestaurants.map((restaurant) => {
              const availability = availabilityFor(restaurant);
              return (
                <div
                  key={restaurant.id}
                  className="flex items-start justify-between gap-3 rounded-xl bg-orange-50 px-3 py-2"
                >
                  <button
                    type="button"
                    onClick={() => setDetailRestaurant(restaurant)}
                    className="min-w-0 flex-1 text-left"
                  >
                    <strong className="block break-words text-sm leading-5">
                      {restaurant.name}
                    </strong>
                    <span className="block break-words text-xs leading-5 text-stone-500">
                      {restaurant.address}
                    </span>
                    <span
                      className={`mt-1 block break-words text-xs font-bold leading-5 ${availability.isOpen ? "text-emerald-700" : "text-rose-700"}`}
                    >
                      {availability.label}
                    </span>
                    {restaurantFacts(restaurant)}
                  </button>
                  <button
                    type="button"
                    onClick={() => toggleChoice(restaurant.id)}
                    className="shrink-0 rounded-lg px-2 py-1 text-sm font-black text-rose-700"
                    aria-label={`Remove ${restaurant.name}`}
                  >
                    ×
                  </button>
                </div>
              );
            })}
          </div>
        ) : (
          <p className="mt-2 text-sm text-stone-500">
            Search below, browse the filtered list, or let a smart option start
            your selection. Nothing starts until you confirm.
          </p>
        )}
      </div>
      <button
        type="button"
        disabled={
          busy || manualSelection.length !== memberCount || hasClosedSelection
        }
        onClick={onSave}
        className="mt-4 rounded-xl bg-orange-500 px-4 py-3 text-sm font-black text-white disabled:cursor-not-allowed disabled:opacity-40"
      >
        {busy ? "Working…" : actionLabel}
      </button>
      {hasClosedSelection && (
        <p className="mt-2 text-xs font-bold text-amber-100">
          Remove or replace the place that is closed at the planned {mealName}{" "}
          time before continuing.
        </p>
      )}
      <div className="mt-4">
        <p className="text-xs font-bold uppercase tracking-widest text-orange-100">
          Smart selection help
        </p>
        <p className="mt-1 text-xs text-orange-50">
          {remainingSelectionCount
            ? `Keep your current picks and fill the remaining ${remainingSelectionCount} spot${remainingSelectionCount === 1 ? "" : "s"} with one of these options.`
            : "Your selection is complete. Remove a place to use a smart option."}{" "}
          Places closed at the planned {mealName} time are skipped.
        </p>
        <div className="mt-2 grid gap-2 sm:grid-cols-3">
          <button
            type="button"
            disabled={
              remainingSelectionCount === 0 ||
              smartFillPlaces.length < remainingSelectionCount
            }
            onClick={() => applySmartChoices("random")}
            className="rounded-xl bg-white px-3 py-3 text-left text-sm font-bold text-orange-900 disabled:opacity-40"
          >
            🎲 Random
          </button>
          <button
            type="button"
            disabled={
              remainingSelectionCount === 0 ||
              smartFillPlaces.length < remainingSelectionCount
            }
            onClick={() => applySmartChoices("fresh")}
            className="rounded-xl bg-white px-3 py-3 text-left text-sm font-bold text-orange-900 disabled:opacity-40"
          >
            🌱 Never picked
          </button>
          <button
            type="button"
            disabled={
              remainingSelectionCount === 0 ||
              smartFillPlaces.length < remainingSelectionCount
            }
            onClick={() => applySmartChoices("rated")}
            className="rounded-xl bg-white px-3 py-3 text-left text-sm font-bold text-orange-900 disabled:opacity-40"
          >
            ⭐ Best rated
          </button>
          <button
            type="button"
            disabled={
              remainingSelectionCount === 0 ||
              smartFillPlaces.length < remainingSelectionCount
            }
            onClick={() => applySmartChoices("stale")}
            className="rounded-xl bg-white px-3 py-3 text-left text-sm font-bold text-orange-900 disabled:opacity-40"
          >
            🕰️ Longest ago
          </button>
          <button
            type="button"
            disabled={
              remainingSelectionCount === 0 ||
              smartFillPlaces.length < remainingSelectionCount
            }
            onClick={() => applySmartChoices("least")}
            className="rounded-xl bg-white px-3 py-3 text-left text-sm font-bold text-orange-900 disabled:opacity-40"
          >
            🔁 Least picked
          </button>
          <button
            type="button"
            disabled={
              remainingSelectionCount === 0 ||
              smartFillPlaces.length < remainingSelectionCount
            }
            onClick={() => applySmartChoices("newest")}
            className="rounded-xl bg-white px-3 py-3 text-left text-sm font-bold text-orange-900 disabled:opacity-40"
          >
            🆕 Recently added
          </button>
        </div>
        {remainingSelectionCount > 0 &&
          smartFillPlaces.length < remainingSelectionCount && (
            <p className="mt-2 text-xs font-bold text-amber-100">
              Only {smartFillPlaces.length} more place
              {smartFillPlaces.length === 1 ? " is" : "s are"} open at the
              planned {mealName} time with these filters. Clear a filter or
              change the {mealName} time to complete your selection.
            </p>
          )}
      </div>
      <div className="mt-5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="text-xs font-bold uppercase tracking-widest text-orange-100">
            Find a restaurant
          </p>
          <button
            type="button"
            onClick={() => setQuickAddOpen((open) => !open)}
            className="rounded-lg bg-white px-3 py-2 text-xs font-black text-orange-900"
          >
            {quickAddOpen ? "Close add place" : "+ Add a new place"}
          </button>
        </div>
        {quickAddOpen && context && (
          <QuickAddPlacePanel
            groupId={context.groupId}
            timeZone={timeZone}
            existingPlaceIds={new Set(restaurants.map((restaurant) => restaurant.google_place_id))}
            onAdded={refreshAfterQuickAdd}
            onClose={() => setQuickAddOpen(false)}
          />
        )}
        <div className="mt-2">
          <RestaurantSearchFilters
            search={search}
            onSearchChange={(value) => {
              setBrowsePage(1);
              setSearch(value);
            }}
            cuisineFilter={cuisineFilter}
            onCuisineFilterChange={(value) => {
              setBrowsePage(1);
              setCuisineFilter(value);
            }}
            cuisines={cuisines}
            addedByFilter={addedByFilter}
            onAddedByFilterChange={(value) => {
              setBrowsePage(1);
              setAddedByFilter(value);
            }}
            contributors={members.map((member) => [member.user_id, member.display_name])}
            dark
          />
        </div>
      </div>
      <div className="mt-4">
        <div className="flex items-center justify-between gap-2">
          <p className="text-sm font-black">
            {search ? "Search results" : "Browse your database"}
          </p>
          <span className="text-xs font-bold text-orange-100">
            {allMatchingPlaces.length} matching place
            {allMatchingPlaces.length === 1 ? "" : "s"}
          </span>
        </div>
        <div className="mt-2 grid gap-2 sm:grid-cols-2">
          {matchingPlaces.map((restaurant) => {
            const selected = manualSelection.includes(restaurant.id);
            const availability = availabilityFor(restaurant);
            const atLimit = !selected && manualSelection.length >= memberCount;
            const closedAtMeal = !selected && !availability.isOpen;
            const blocked = atLimit || closedAtMeal;
            const label = selected
              ? "Selected ✓"
              : closedAtMeal
                ? `Closed at ${mealName}`
                : atLimit
                  ? "Selection full"
                  : "Add +";
            return (
              <article
                key={restaurant.id}
                className={`flex min-w-0 items-start justify-between gap-3 rounded-xl border px-3 py-3 text-stone-900 ${selected ? "border-orange-300 bg-orange-100" : "border-white/70 bg-white"}`}
              >
                <button
                  type="button"
                  onClick={() => setDetailRestaurant(restaurant)}
                  className="min-w-0 flex-1 text-left"
                >
                  <strong className="block break-words text-sm leading-5">
                    {restaurant.name}
                  </strong>
                  <span className="block break-words text-xs leading-5 text-stone-500">
                    {restaurant.address}
                  </span>
                  <span
                    className={`mt-1 block break-words text-xs font-bold leading-5 ${availability.isOpen ? "text-emerald-700" : "text-rose-700"}`}
                  >
                    {availability.label}
                  </span>
                  {restaurantFacts(restaurant)}
                </button>
                <button
                  type="button"
                  disabled={blocked}
                  onClick={() => toggleChoice(restaurant.id)}
                  className="shrink-0 self-start rounded-lg bg-orange-50 px-3 py-2 text-xs font-black text-orange-800 disabled:cursor-not-allowed disabled:opacity-55"
                >
                  {label}
                </button>
              </article>
            );
          })}
        </div>
        {matchingPlaces.length === 0 && (
          <p className="mt-3 rounded-xl bg-white/15 px-3 py-3 text-sm text-orange-50">
            No active places match those filters. Clear a filter or add a new
            place above.
          </p>
        )}
        {allMatchingPlaces.length > placesPerSelectionPage && (
          <nav className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-2xl bg-white/15 px-3 py-3" aria-label="Restaurant selection pages">
            <button
              type="button"
              onClick={() => setBrowsePage((page) => Math.max(1, page - 1))}
              disabled={currentBrowsePage === 1}
              className="rounded-xl bg-white px-3 py-2 text-sm font-black text-stone-900 disabled:opacity-40"
            >
              ← Previous
            </button>
            <span className="text-xs font-bold text-orange-50">
              Places {(currentBrowsePage - 1) * placesPerSelectionPage + 1}–{Math.min(currentBrowsePage * placesPerSelectionPage, allMatchingPlaces.length)} of {allMatchingPlaces.length}
            </span>
            <button
              type="button"
              onClick={() => setBrowsePage((page) => Math.min(selectionPageCount, page + 1))}
              disabled={currentBrowsePage === selectionPageCount}
              className="rounded-xl bg-white px-3 py-2 text-sm font-black text-stone-900 disabled:opacity-40"
            >
              Next →
            </button>
          </nav>
        )}
      </div>
    </div>
  );
  const renderRoundProgress = () =>
    current?.status === "active" ? (
      <section className="mt-5 rounded-2xl border border-white/30 bg-white/15 p-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <p className="text-xs font-bold uppercase tracking-widest text-orange-100">
              The {mealName} decision, live
            </p>
            <h2 className="mt-1 text-lg font-black">
              {survivorRestaurants.length} of {memberCount} picks still standing
            </h2>
          </div>
          <span className="rounded-full bg-white px-3 py-1 text-xs font-black text-orange-800">
            🎲 Pick → ✂️ veto → 🏆 {mealName}
          </span>
        </div>
        <div className="mt-3 flex flex-wrap gap-2">
          {survivorRestaurants.map((restaurant) => (
            <button
              key={restaurant.id}
              type="button"
              onClick={() => setDetailRestaurant(restaurant)}
              className="max-w-full rounded-xl bg-white px-3 py-2 text-left text-sm font-bold text-stone-900"
            >
              <span className="block">🍽️ {restaurant.name}</span>
              <span className="mt-1 block text-xs font-semibold text-stone-500">
                {availabilityFor(restaurant).label} ·{" "}
                {restaurant.added_by
                  ? `added by ${memberNameById.get(restaurant.added_by) ?? "a crew member"}`
                  : "added by a crew member"}
              </span>
            </button>
          ))}
        </div>
        <div className="mt-4 border-t border-white/25 pt-3">
          <p className="text-sm font-bold">
            {pendingVetoers.length
              ? `Still holding a veto: ${pendingVetoers.map((member) => member.display_name).join(", ")}`
              : "Every eligible veto is in — the final choice is being revealed."}
          </p>
          <div className="mt-2 flex flex-wrap gap-2">
            {eligibleVoters.map((member) => {
              const used = vetoes.some(
                (veto) => veto.user_id === member.user_id,
              );
              return (
                <span
                  key={member.user_id}
                  className={`rounded-full px-3 py-1 text-xs font-bold ${used ? "bg-emerald-100 text-emerald-900" : "bg-amber-100 text-amber-950"}`}
                >
                  {used ? "✓" : "⏳"} {member.display_name}{" "}
                  {used ? "vetoed" : "is up"}
                </span>
              );
            })}
          </div>
        </div>
        <p className="mt-3 text-xs text-orange-50">
          {suggester?.display_name ?? "The suggester"} made the original picks.
          Each other friend gets one veto; the last restaurant standing wins.
        </p>
      </section>
    ) : null;
  const renderScheduleEditor = () =>
    current ? (
      <div className="mx-auto w-full max-w-xl rounded-2xl bg-white p-4 text-stone-900 shadow-sm sm:mx-0">
        <p className="text-xs font-bold uppercase tracking-widest text-orange-600">
          {mealNameTitle} time · anyone in the crew can update
        </p>
        <p className="mt-1 text-xl font-black">
          {formatLunchTime(current.scheduled_for, timeZone)}
        </p>
        <div className="mx-auto mt-4 grid w-full max-w-[18rem] min-w-0 gap-3 sm:max-w-none sm:grid-cols-2">
          <label className="w-full min-w-0 text-left text-sm font-bold">
            {mealNameTitle} date
            <input
              type="date"
              value={lunchDate}
              onChange={(event) => {
                scheduleDraftDirty.current = true;
                setLunchDate(event.target.value);
              }}
              className="date-time-input mt-1 block h-11 w-full min-w-0 max-w-full rounded-xl border border-orange-200 px-3 text-base"
            />
          </label>
          <label className="w-full min-w-0 text-left text-sm font-bold">
            {mealNameTitle} time
            <input
              type="time"
              value={lunchTime}
              onChange={(event) => {
                scheduleDraftDirty.current = true;
                setLunchTime(event.target.value);
              }}
              className="date-time-input mt-1 block h-11 w-full min-w-0 max-w-full rounded-xl border border-orange-200 px-3 text-base"
            />
          </label>
          <button
            type="button"
            disabled={busy}
            onClick={() => void saveSchedule()}
            className="mx-auto w-full rounded-xl bg-orange-500 px-4 py-3 text-sm font-black text-white disabled:opacity-60 sm:col-span-2 sm:mx-0 sm:max-w-xs"
          >
            {busy ? "Saving…" : `Update ${mealName} time`}
          </button>
        </div>
      </div>
    ) : null;
  const renderCloseLoopPanel = () =>
    current?.status === "chosen" ? (
      <div className="rounded-2xl border border-white/30 bg-white/15 p-4">
        <p className="text-sm font-bold">
          {isOccasion ? "Ready to wrap up this occasion?" : "Ready to hand off the next round?"}
        </p>
        <p className="mt-1 text-sm text-orange-50">
          {isOccasion
            ? "Closing records this visit. The restaurant list stays here, and any crew member can start the next occasion when ready."
            : "Closing records this visit and hands the next picks to the next person in order."}
        </p>
        <button
          type="button"
          disabled={busy || !scheduleHasPassed}
          onClick={() => void closeLoop()}
          className="mt-3 rounded-xl bg-orange-500 px-4 py-3 text-sm font-black text-white disabled:cursor-not-allowed disabled:opacity-45"
        >
          {scheduleHasPassed
            ? isOccasion ? "Finish this occasion →" : "Close the loop →"
            : `Available after ${formatLunchTime(current.scheduled_for, timeZone)}`}
        </button>
      </div>
    ) : null;

  let heroEyebrow =
    mealName === "dinner" ? "It’s dinner time" : "It’s lunch o’clock";
  let heroTitle = "Where are we going today?";
  let heroCopy =
    "Your crew’s restaurant memory, decision loop, and lunch lore in one place.";
  let heroAction: ReactNode = null;
  if (loading && !context) {
    heroEyebrow = reconnecting ? "Reconnecting" : "Getting your loop ready";
    heroTitle = reconnecting ? "Finding the latest lunch decision…" : "Connecting your Lunch Loop…";
    heroCopy = "Restoring your secure session and the crew’s latest picks. This normally takes just a moment.";
  } else if (error && !context) {
    heroEyebrow = "Connection check";
    heroTitle = "Your Lunch Loop needs one more try";
    heroCopy = "Your data is safe. A new browser session can take a moment to reconnect after a restart.";
    heroAction = (
      <button
        type="button"
        onClick={() => {
          retryAttempts.current = 0;
          setLoading(true);
          setReconnecting(false);
          setLoadNonce((value) => value + 1);
        }}
        className="mt-5 rounded-xl bg-white px-4 py-3 text-sm font-black text-orange-900"
      >
        Try again ↻
      </button>
    );
  } else if (context && !current) {
    if (memberCount < 2) {
      heroTitle = "Invite one more person to start the loop";
      heroCopy = "Lunch Loop needs at least two people so there is someone to make the pick and someone else to help narrow it down.";
      heroAction = <Link href="/settings" className="mt-5 inline-flex rounded-xl bg-white px-4 py-3 text-sm font-black text-orange-900">Invite your crew →</Link>;
    } else if (available.length < Math.max(2, memberCount)) {
      heroTitle = "The lunch database needs a few more places";
      const needed = Math.max(2, memberCount) - available.length;
      heroCopy = isOccasion
        ? `Add ${needed} more ${needed === 1 ? "place" : "places"}, then ${completedCount > 0 ? "any crew member" : occasionOwner?.display_name ?? "the owner"} can start the occasion.`
        : `Add ${needed} more ${needed === 1 ? "place" : "places"}, then ${nextSuggester?.display_name ?? "the next picker"} can start the loop.`;
    } else if (canStartRound) {
      heroEyebrow = isOccasion ? "Your occasion, your picks" : "Your turn to suggest";
      heroTitle = isOccasion
        ? `Choose ${memberCount} places for this ${mealName}`
        : `Choose ${memberCount} places for the crew`;
      heroCopy = isOccasion
        ? `Set the ${mealName} time, make your picks, and the group can begin vetoing right here. This occasion will not hand off to a next picker.`
        : `Set the ${mealName} time, make your picks, and the group can begin vetoing right here.`;
      heroAction = (
        <>
          <div className="mx-auto mt-5 grid w-full max-w-[18rem] min-w-0 gap-3 rounded-2xl bg-white/15 p-4 sm:mx-0 sm:max-w-xl sm:grid-cols-2">
            <label className="w-full min-w-0 text-left text-sm font-bold">
              {mealNameTitle} date
              <input
                type="date"
                value={lunchDate}
                onChange={(event) => {
                  scheduleDraftDirty.current = true;
                  setLunchDate(event.target.value);
                }}
                className="date-time-input mt-1 block h-11 w-full min-w-0 max-w-full rounded-xl border border-white/40 bg-white px-3 text-base text-stone-900"
              />
            </label>
            <label className="w-full min-w-0 text-left text-sm font-bold">
              {mealNameTitle} time
              <input
                type="time"
                value={lunchTime}
                onChange={(event) => {
                  scheduleDraftDirty.current = true;
                  setLunchTime(event.target.value);
                }}
                className="date-time-input mt-1 block h-11 w-full min-w-0 max-w-full rounded-xl border border-white/40 bg-white px-3 text-base text-stone-900"
              />
            </label>
          </div>
          {renderChoicePicker({
            actionLabel: isOccasion ? "Start this Occasion →" : "Start the Lunch Loop →",
            onSave: () => void startRound("manual", manualSelection),
          })}
        </>
      );
    } else {
      heroEyebrow = "Next up";
      heroTitle = isOccasion
        ? `${occasionOwner?.display_name ?? "The owner"} sets up the first ${mealName}`
        : `${nextSuggester?.display_name ?? "A crew member"} is choosing ${mealName}`;
      heroCopy = isOccasion
        ? `The Occasion owner makes the first ${memberCount} picks. After this night, any member can start a future occasion and make that night’s picks.`
        : `They’ll select ${memberCount} places. Then everyone else gets one veto to narrow it down.`;
    }
  }
  if (current?.status === "active") {
    if (isCurrentSuggester && !choicesLocked) {
      heroEyebrow = "Your picks are open";
      heroTitle = "Adjust your choices before the first veto";
      heroCopy =
        "No veto has landed yet, so you can still refine the list. After the first veto, the choices lock for this round.";
      heroAction = renderChoicePicker({
        actionLabel: "Save these picks",
        onSave: () => void saveChoices(),
      });
    } else if (isCurrentSuggester) {
      heroEyebrow = "Your choices are live";
      heroTitle = "The crew is narrowing it down";
      heroCopy = `${vetoes.length} of ${Math.max(memberCount - 1, 0)} vetoes used. Your picks are locked now that the first veto has landed.`;
    } else if (myVeto) {
      heroEyebrow = "Your veto is in";
      heroTitle = "You’ve made your call";
      heroCopy = `${myVetoRestaurant?.name ?? "That place"} is out. You get one veto this round; waiting for the rest of the crew.`;
    } else {
      heroEyebrow = "Your next step";
      heroTitle = `Veto one of ${suggester?.display_name ?? "the picker"}’s choices`;
      heroCopy = `${suggester?.display_name ?? "The picker"} made these picks. Choose the one place you do not want today; they do not get a veto this round.`;
      heroAction = (
        <div className="mt-5 grid gap-3 sm:grid-cols-2">
          {survivors.map((candidate) => {
            const restaurant = restaurants.find(
              (place) => place.id === candidate.restaurant_id,
            );
            if (!restaurant) return null;
            const availability = availabilityFor(restaurant);
            return (
              <article
                key={candidate.id}
                className="rounded-2xl bg-white p-4 text-stone-900 shadow-sm"
              >
                <button
                  type="button"
                  onClick={() => setDetailRestaurant(restaurant)}
                  className="w-full text-left"
                >
                  <p className="text-lg font-black">{restaurant.name}</p>
                  <p className="mt-1 text-sm text-stone-500">
                    {restaurant.address}
                  </p>
                  <p
                    className={`mt-2 text-xs font-bold ${availability.isOpen ? "text-emerald-700" : "text-rose-700"}`}
                  >
                    {availability.label}
                  </p>
                  <div className="mt-1">{restaurantFacts(restaurant)}</div>
                </button>
                <div className="mt-3 flex items-center justify-between gap-2">
                  <span className="text-xs font-bold text-orange-700">
                    {restaurant.cuisine || "Restaurant"}
                  </span>
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => void veto(candidate)}
                    className="rounded-xl bg-rose-600 px-3 py-2 text-sm font-black text-white disabled:opacity-60"
                  >
                    Veto this
                  </button>
                </div>
              </article>
            );
          })}
        </div>
      );
    }
  }
  if (current?.status === "chosen") {
    heroEyebrow = `${mealNameTitle} is decided`;
    heroTitle = `${winner?.name ?? mealNameTitle} wins! 🎉`;
    heroCopy = isOccasion
      ? `Enjoy ${mealName}, then finish this occasion. Any crew member can start another one whenever the next night out comes around.`
      : `Enjoy ${mealName}, then close the loop so the next person can make the next set of picks.`;
    heroAction = (
      <button
        type="button"
        onClick={() => winner && setDetailRestaurant(winner)}
        className="mt-5 w-full rounded-2xl bg-emerald-50 p-4 text-left text-stone-900 transition hover:bg-emerald-100 focus:outline-none focus:ring-2 focus:ring-white"
        aria-label={winner ? `View details for ${winner.name}` : undefined}
      >
        <p className="text-4xl">🎉🍽️🎉</p>
        <p className="mt-2 break-words text-lg font-black">
          {winner?.name ?? "The final choice"}
        </p>
        <p className="mt-1 break-words text-sm text-stone-600">{winner?.address}</p>
        {winner && <div className="mt-2">{restaurantFacts(winner)}</div>}
        <p className="mt-3 text-xs font-bold text-emerald-800">
          Tap for restaurant details and map →
        </p>
      </button>
    );
  }

  if (needsInvite) return <NoLoopWelcome />;

  return (
    <AppFrame>
      <section className="relative overflow-hidden rounded-3xl bg-orange-500 p-6 text-white shadow-lg shadow-orange-200">
        <div className="absolute -right-8 -top-6 text-9xl opacity-20">🍟</div>
        <div className="relative">
          <p className="text-sm font-bold uppercase tracking-widest text-orange-100">
            {heroEyebrow}
          </p>
          <h1 className="mt-1 max-w-3xl text-3xl font-black tracking-tight">
            {heroTitle}
          </h1>
          <p className="mt-3 max-w-2xl text-orange-50">{heroCopy}</p>
          {heroAction}
          {renderRoundProgress()}
          {current?.status === "chosen" ? (
            <div className="mt-5 grid items-start gap-4 lg:grid-cols-2">
              {renderScheduleEditor()}
              {renderCloseLoopPanel()}
            </div>
          ) : current ? (
            <div className="mt-5">{renderScheduleEditor()}</div>
          ) : null}
          {current?.status === "chosen" && context?.userId && current.id ? (
            <PickValueNudge
              userId={context.userId}
              sessionId={current.id}
              facts={{
                loopName: context.groupName,
                restaurantName: winner?.name ?? "Today's pick",
                pickedOn: receiptDate(current.scheduled_for, timeZone),
                memberCount,
                closedLunchCount: completedCount,
                vetoCount: vetoes.length,
              }}
            />
          ) : null}
          {message && (
            <p
              role="status"
              className="mt-4 rounded-xl bg-emerald-50 px-3 py-2 text-sm font-bold text-emerald-900"
            >
              {message}
            </p>
          )}
          {error && context && (
            <p
              role="alert"
              className="mt-4 rounded-xl bg-rose-50 px-3 py-2 text-sm font-bold text-rose-800"
            >
              {error}
            </p>
          )}
        </div>
      </section>
      {loading ? (
        <div className="mt-6 rounded-2xl bg-white p-5 text-sm text-stone-600 shadow-sm">
          <p className="font-semibold">{slowLoading ? "Still connecting to your Lunch Loop…" : "Loading your Lunch Loop…"}</p>
          {slowLoading && <div className="mt-3 flex flex-wrap gap-3"><button type="button" onClick={retryHomeLoad} className="rounded-xl bg-orange-500 px-4 py-2.5 text-sm font-black text-white">Try again</button><button type="button" onClick={() => window.location.reload()} className="rounded-xl border border-orange-200 bg-white px-4 py-2.5 text-sm font-black text-orange-800">Refresh page</button></div>}
        </div>
      ) : error && !context ? (
        <section className="mt-6 rounded-3xl border border-rose-100 bg-white p-5 shadow-sm">
          <p className="text-xs font-bold uppercase tracking-widest text-rose-700">Connection check</p>
          <h2 className="mt-1 text-xl font-black">Your Lunch Loop could not load yet</h2>
          <p className="mt-2 text-sm leading-6 text-stone-600">{error}</p>
          <div className="mt-4 flex flex-wrap gap-3"><button type="button" onClick={retryHomeLoad} className="rounded-xl bg-orange-500 px-4 py-3 text-sm font-black text-white">Try again</button><button type="button" onClick={() => window.location.reload()} className="rounded-xl border border-orange-200 bg-white px-4 py-3 text-sm font-black text-orange-800">Refresh page</button></div>
        </section>
      ) : !context ? (
        <>
          <GroupSetup />
          <section className="mt-5 rounded-3xl bg-white p-5 shadow-sm">
            <p className="text-xs font-bold uppercase tracking-widest text-orange-600">
              Getting started
            </p>
            <h2 className="mt-1 text-xl font-black">
              Set up your Lunch Loop
            </h2>
            <ol className="mt-3 space-y-2 text-sm text-stone-600">
              <li>1. Create a Lunch Loop for your crew or enter an owner&apos;s invitation code.</li>
              <li>2. Add a few favorite places.</li>
              <li>3. Invite your friends from Settings.</li>
              <li>4. Start your first round when you have enough places.</li>
            </ol>
          </section>
        </>
      ) : (
        <>
          <section className="mt-5 grid gap-3 sm:grid-cols-2">
            <Link
              href="/database"
              className="rounded-2xl bg-white p-4 shadow-sm transition hover:ring-2 hover:ring-orange-300"
            >
              <p className="text-xs font-bold uppercase tracking-wide text-stone-400">
                Lunch database
              </p>
              <p className="mt-2 text-xl font-black">
                {restaurants.length} places
              </p>
              <p className="mt-1 text-sm text-orange-700">
                Browse and sort every place →
              </p>
            </Link>
            {lastLunch ? (
              <button
                type="button"
                onClick={() => setDetailRestaurant(lastLunch.restaurant)}
                className="rounded-2xl bg-white p-4 text-left shadow-sm transition hover:ring-2 hover:ring-orange-300"
              >
                <p className="text-xs font-bold uppercase tracking-wide text-stone-400">
                  Last lunch
                </p>
                <p className="mt-2 text-xl font-black">
                  {lastLunch.restaurant.name}
                </p>
                <p className="mt-1 text-sm text-stone-500">
                  {formatLunchTime(lastLunch.scheduled_for, timeZone)}
                </p>
                <div className="mt-2">
                  {restaurantFacts(lastLunch.restaurant)}
                </div>
                <p className="mt-3 text-xs font-bold text-orange-700">
                  View details and map →
                </p>
              </button>
            ) : (
              <div className="rounded-2xl bg-white p-4 shadow-sm">
                <p className="text-xs font-bold uppercase tracking-wide text-stone-400">
                  Last lunch
                </p>
                <p className="mt-2 text-xl font-black">No lunch yet</p>
                <p className="mt-1 text-sm text-stone-500">
                  Your first decision is next
                </p>
              </div>
            )}
          </section>
          <section className="mt-7">
            <p className="text-xs font-bold uppercase tracking-wide text-orange-600">
              Lunch lore
            </p>
            <h2 className="mt-1 text-xl font-black">
              Little facts from your list
            </h2>
            <p className="mt-1 text-sm text-stone-500">
              Tap a card to explore the detail behind it.
            </p>
            <div className="mt-3 grid gap-3 sm:grid-cols-3">
              <Link
                href="/database?sort=never-visited"
                className="rounded-2xl border border-orange-100 bg-white p-4 transition hover:ring-2 hover:ring-orange-300"
              >
                <p className="text-2xl">🌱</p>
                <p className="mt-2 text-xl font-black">
                  {
                    available.filter(
                      (restaurant) => restaurant.visit_count === 0,
                    ).length
                  }
                </p>
                <p className="text-sm text-stone-500">
                  places waiting for a first visit
                </p>
                <p className="mt-2 text-xs font-bold text-orange-700">
                  See fresh places →
                </p>
              </Link>
              <Link
                href="/stats#cuisine-popularity"
                className="rounded-2xl border border-orange-100 bg-white p-4 transition hover:ring-2 hover:ring-orange-300"
              >
                <p className="text-2xl">🍽️</p>
                <p className="mt-2 text-xl font-black">
                  {
                    new Set(
                      available.map(
                        (restaurant) => restaurant.cuisine || "Restaurant",
                      ),
                    ).size
                  }
                </p>
                <p className="text-sm text-stone-500">
                  different cuisines in the database
                </p>
                <p className="mt-2 text-xs font-bold text-orange-700">
                  See cuisine stats →
                </p>
              </Link>
              {newestRestaurant ? (
                <button
                  type="button"
                  onClick={() => setDetailRestaurant(newestRestaurant)}
                  className="rounded-2xl border border-orange-100 bg-white p-4 text-left transition hover:ring-2 hover:ring-orange-300 focus:outline-none focus:ring-2 focus:ring-orange-300"
                >
                  <p className="text-2xl">✨</p>
                  <p className="mt-2 truncate text-xl font-black">
                    {newestRestaurant.name}
                  </p>
                  <p className="text-sm text-stone-500">
                    newest place added to the list
                  </p>
                  <p className="mt-2 text-xs font-bold text-orange-700">
                    View details, map, and directions →
                  </p>
                </button>
              ) : (
                <Link
                  href="/add-place"
                  className="rounded-2xl border border-orange-100 bg-white p-4 transition hover:ring-2 hover:ring-orange-300"
                >
                  <p className="text-2xl">✨</p>
                  <p className="mt-2 text-xl font-black">Add a first place</p>
                  <p className="text-sm text-stone-500">
                    Every good list starts somewhere
                  </p>
                  <p className="mt-2 text-xs font-bold text-orange-700">
                    Add a place →
                  </p>
                </Link>
              )}
            </div>
          </section>
        </>
      )}
      <RestaurantDetailsDialog
        restaurant={detailRestaurant}
        onClose={() => setDetailRestaurant(null)}
        addedBy={
          detailRestaurant?.added_by
            ? memberNameById.get(detailRestaurant.added_by)
            : null
        }
        plannedFor={current?.scheduled_for}
        timeZone={timeZone}
      />
    </AppFrame>
  );
}
