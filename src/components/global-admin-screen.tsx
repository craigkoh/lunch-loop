"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { AppFrame, EmptyState } from "./app-frame";
import { RestaurantDetailsDialog } from "./restaurant-details-dialog";
import type { Restaurant } from "@/lib/types";
import { createClient } from "@/lib/supabase/client";

type AdminGroup = {
  id: string;
  name: string;
  home_label: string | null;
  loop_type: "standing" | "occasion";
  status: "active" | "suspended";
  suspended_reason: string | null;
  suspended_at: string | null;
  created_at: string;
};
type AdminMember = {
  group_id: string;
  user_id: string;
  role: "owner" | "member";
  rotation_order: number;
  profiles: { display_name: string } | null;
};
type AdminRestaurant = Restaurant & {
  group_id: string;
  profiles: { display_name: string } | null;
};
type AdminSession = {
  id: string;
  group_id: string;
  status: "active" | "chosen" | "completed" | "cancelled";
  started_at: string;
  scheduled_for: string;
  final_restaurant_id: string | null;
};
type AdminUserSearchResult = {
  user_id: string;
  display_name: string;
  google_full_name: string | null;
  account_email: string | null;
};
type SummaryView = "loops" | "people" | "restaurants" | "in-progress" | "decisions";
type SiteAdmin = {
  user_id: string;
  granted_at: string;
  profiles: { display_name: string } | null;
};
type InviteRequest = {
  id: string;
  user_id: string;
  display_name: string;
  account_email: string | null;
  auth_provider: string | null;
  note: string | null;
  status: "new" | "reviewed" | "invited" | "declined" | "spam";
  requested_at: string;
  reviewed_at: string | null;
  review_note: string | null;
};
type FeedbackItem = {
  id: string;
  user_id: string;
  display_name: string;
  account_email: string | null;
  group_name: string | null;
  kind: "bug" | "feature" | "question" | "other";
  title: string;
  details: string;
  page_path: string | null;
  build: string | null;
  status: "new" | "triaged" | "planned" | "in_progress" | "shipped" | "declined" | "duplicate";
  priority: "low" | "normal" | "high" | "urgent";
  admin_note: string | null;
  reporter_note: string | null;
  duplicate_of: string | null;
  created_at: string;
  updated_at: string;
  credit_opt_in: boolean;
  credit_name: string | null;
  notified_at: string | null;
};
type PlacesLimits = {
  place_search_user_limit_10m: number;
  place_search_group_limit_10m: number;
  place_detail_user_limit_10m: number;
  place_detail_group_limit_10m: number;
  area_search_user_limit_10m: number;
  places_user_limit_per_day: number;
  places_group_limit_per_day: number;
};
type PlacesUsageDay = {
  day: string;
  action_name: "place_search" | "place_detail" | "area_search";
  requests: number;
  people: number;
  lunch_loops: number;
};
type PlacesUsageGroup = {
  group_id: string;
  group_name: string;
  requests: number;
  place_searches: number;
  place_details: number;
  latest_request_at: string;
};
const defaultPlacesLimits: PlacesLimits = {
  place_search_user_limit_10m: 30,
  place_search_group_limit_10m: 120,
  place_detail_user_limit_10m: 60,
  place_detail_group_limit_10m: 240,
  area_search_user_limit_10m: 20,
  places_user_limit_per_day: 250,
  places_group_limit_per_day: 1500,
};

function actionErrorMessage(error: unknown, fallback: string) {
  if (error instanceof Error) return error.message;
  if (
    error &&
    typeof error === "object" &&
    "message" in error &&
    typeof error.message === "string"
  )
    return error.message;
  return fallback;
}

function dateLabel(value?: string | null) {
  return value
    ? new Intl.DateTimeFormat(undefined, {
        weekday: "long",
        month: "short",
        day: "numeric",
        year: "numeric",
      }).format(new Date(value))
    : "—";
}
function timeLabel(value?: string | null) {
  return value
    ? new Intl.DateTimeFormat(undefined, {
        weekday: "long",
        month: "short",
        day: "numeric",
        year: "numeric",
        hour: "numeric",
        minute: "2-digit",
      }).format(new Date(value))
    : "—";
}

function SummaryCard({ active, label, value, detail, onClick, tone = "plain" }: { active: boolean; label: string; value: number; detail: string; onClick: () => void; tone?: "plain" | "orange" }) {
  const className = tone === "orange"
    ? "bg-orange-500 text-white hover:bg-orange-600"
    : active ? "border-orange-300 bg-orange-50 text-stone-900" : "bg-white text-stone-900 hover:border-orange-200";
  return <button type="button" onClick={onClick} aria-pressed={active} className={`rounded-2xl border border-transparent p-4 text-left shadow-sm transition ${className}`}>
    <p className={`text-xs font-bold ${tone === "orange" ? "text-orange-100" : "text-stone-500"}`}>{label.toUpperCase()}</p>
    <p className="mt-1 text-3xl font-black">{value}</p>
    <p className={`mt-1 text-xs font-semibold ${tone === "orange" ? "text-orange-100" : "text-orange-700"}`}>{detail} →</p>
  </button>;
}

function StatFact({ label, value }: { label: string; value: string | number }) {
  return <div className="rounded-2xl bg-orange-50 p-3"><p className="text-xs font-bold uppercase tracking-wide text-orange-700">{label}</p><p className="mt-1 text-xl font-black">{value}</p></div>;
}

export function GlobalAdminScreen() {
  const [groups, setGroups] = useState<AdminGroup[]>([]);
  const [members, setMembers] = useState<AdminMember[]>([]);
  const [restaurants, setRestaurants] = useState<AdminRestaurant[]>([]);
  const [detailRestaurant, setDetailRestaurant] =
    useState<AdminRestaurant | null>(null);
  const [sessions, setSessions] = useState<AdminSession[]>([]);
  const [siteAdmins, setSiteAdmins] = useState<SiteAdmin[]>([]);
  const [inviteRequests, setInviteRequests] = useState<InviteRequest[]>([]);
  const [feedbackItems, setFeedbackItems] = useState<FeedbackItem[]>([]);
  const [allowNewGroups, setAllowNewGroups] = useState(true);
  const [feedbackWebhookEnabled, setFeedbackWebhookEnabled] = useState(true);
  const [donationsEnabled, setDonationsEnabled] = useState(false);
  const [ownedLoopLimit, setOwnedLoopLimit] = useState(4);
  const [memberInviteLimit, setMemberInviteLimit] = useState("");
  const [placesLimits, setPlacesLimits] = useState<PlacesLimits>(defaultPlacesLimits);
  const [placesUsage, setPlacesUsage] = useState<PlacesUsageDay[]>([]);
  const [placesUsageByGroup, setPlacesUsageByGroup] = useState<PlacesUsageGroup[]>([]);
  const [adminSearch, setAdminSearch] = useState("");
  const [adminCandidates, setAdminCandidates] = useState<AdminUserSearchResult[]>([]);
  const [adminSearchLoading, setAdminSearchLoading] = useState(false);
  const [adminSearchError, setAdminSearchError] = useState("");
  const [newAdmin, setNewAdmin] = useState<AdminUserSearchResult | null>(null);
  const [selectedGroupId, setSelectedGroupId] = useState("");
  const [search, setSearch] = useState("");
  const [groupName, setGroupName] = useState("");
  const [groupStatus, setGroupStatus] = useState<"active" | "suspended">(
    "active",
  );
  const [suspensionReason, setSuspensionReason] = useState("");
  const [loading, setLoading] = useState(true);
  const [authorized, setAuthorized] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [deleteConfirmation, setDeleteConfirmation] = useState("");
  const [deleteConfirmationError, setDeleteConfirmationError] = useState("");
  const [summaryView, setSummaryView] = useState<SummaryView | null>(null);
  const [decisionLocation, setDecisionLocation] = useState("");
  const adminLoadInFlight = useRef(false);
  const adminSessionRetries = useRef(0);
  const adminRetryTimer = useRef<number | null>(null);

  async function load() {
    if (adminLoadInFlight.current) return;
    adminLoadInFlight.current = true;
    let retryScheduled = false;
    setLoading(true);
    setError("");
    try {
      const supabase = createClient();
      const { data: { session }, error: sessionError } = await supabase.auth.getSession();
      if (sessionError || !session) {
        if (adminSessionRetries.current < 3) {
          const delay = [400, 900, 1_800][adminSessionRetries.current] ?? 1_800;
          adminSessionRetries.current += 1;
          retryScheduled = true;
          adminRetryTimer.current = window.setTimeout(() => void load(), delay);
          return;
        }
        throw new Error("Your sign-in could not be restored. Refresh the page and try again.");
      }
      const { data: isAdmin, error: adminError } =
        await supabase.rpc("is_site_admin");
      if (adminError) {
        if (adminSessionRetries.current < 3) {
          const delay = [400, 900, 1_800][adminSessionRetries.current] ?? 1_800;
          adminSessionRetries.current += 1;
          retryScheduled = true;
          adminRetryTimer.current = window.setTimeout(() => void load(), delay);
          return;
        }
        throw adminError;
      }
      adminSessionRetries.current = 0;
      if (!isAdmin) {
        setAuthorized(false);
        return;
      }
      setAuthorized(true);
      const [
        settingsResult,
        groupsResult,
        membersResult,
        restaurantsResult,
        sessionsResult,
        adminsResult,
        inviteRequestsResult,
        feedbackResult,
        placesUsageResult,
        placesUsageByGroupResult,
      ] = await Promise.all([
        supabase
          .from("site_settings")
          .select("allow_new_groups, owned_loop_limit, member_invite_limit_per_day, feedback_webhook_enabled, donations_enabled, place_search_user_limit_10m, place_search_group_limit_10m, place_detail_user_limit_10m, place_detail_group_limit_10m, area_search_user_limit_10m, places_user_limit_per_day, places_group_limit_per_day")
          .eq("singleton", true)
          .single(),
        supabase
          .from("groups")
          .select(
            "id, name, home_label, loop_type, status, suspended_reason, suspended_at, created_at",
          )
          .order("created_at", { ascending: false }),
        supabase
          .from("group_members")
          .select(
            "group_id, user_id, role, rotation_order, profiles(display_name)",
          )
          .order("rotation_order"),
        supabase
          .from("restaurants")
          .select("*, profiles!restaurants_added_by_fkey(display_name)")
          .order("created_at", { ascending: false }),
        supabase
          .from("lunch_sessions")
          .select(
            "id, group_id, status, started_at, scheduled_for, final_restaurant_id",
          )
          .order("started_at", { ascending: false }),
        supabase
          .from("site_admins")
          .select(
            "user_id, granted_at, profiles!site_admins_user_id_fkey(display_name)",
          )
          .order("granted_at"),
        supabase.rpc("get_site_lunch_loop_invite_requests"),
        supabase.rpc("get_site_lunch_loop_feedback"),
        supabase.rpc("get_site_places_usage", { days_to_include: 7 }),
        supabase.rpc("get_site_places_usage_by_group", { days_to_include: 7 }),
      ]);
      const failed =
        settingsResult.error ||
        groupsResult.error ||
        membersResult.error ||
        restaurantsResult.error ||
        sessionsResult.error ||
        adminsResult.error ||
        inviteRequestsResult.error ||
        feedbackResult.error ||
        placesUsageResult.error
        || placesUsageByGroupResult.error;
      if (failed) throw failed;
      const nextGroups = (groupsResult.data ?? []) as AdminGroup[];
      setGroups(nextGroups);
      setMembers((membersResult.data ?? []) as unknown as AdminMember[]);
      setRestaurants((restaurantsResult.data ?? []) as AdminRestaurant[]);
      setSessions((sessionsResult.data ?? []) as AdminSession[]);
      setSiteAdmins((adminsResult.data ?? []) as unknown as SiteAdmin[]);
      setInviteRequests((inviteRequestsResult.data ?? []) as InviteRequest[]);
      setFeedbackItems((feedbackResult.data ?? []) as FeedbackItem[]);
      setAllowNewGroups(Boolean(settingsResult.data?.allow_new_groups));
      setFeedbackWebhookEnabled(settingsResult.data?.feedback_webhook_enabled !== false);
      setDonationsEnabled(settingsResult.data?.donations_enabled === true);
      setOwnedLoopLimit(settingsResult.data?.owned_loop_limit ?? 4);
      setMemberInviteLimit(
        settingsResult.data?.member_invite_limit_per_day?.toString() ?? "",
      );
      setPlacesLimits({
        place_search_user_limit_10m: settingsResult.data?.place_search_user_limit_10m ?? defaultPlacesLimits.place_search_user_limit_10m,
        place_search_group_limit_10m: settingsResult.data?.place_search_group_limit_10m ?? defaultPlacesLimits.place_search_group_limit_10m,
        place_detail_user_limit_10m: settingsResult.data?.place_detail_user_limit_10m ?? defaultPlacesLimits.place_detail_user_limit_10m,
        place_detail_group_limit_10m: settingsResult.data?.place_detail_group_limit_10m ?? defaultPlacesLimits.place_detail_group_limit_10m,
        area_search_user_limit_10m: settingsResult.data?.area_search_user_limit_10m ?? defaultPlacesLimits.area_search_user_limit_10m,
        places_user_limit_per_day: settingsResult.data?.places_user_limit_per_day ?? defaultPlacesLimits.places_user_limit_per_day,
        places_group_limit_per_day: settingsResult.data?.places_group_limit_per_day ?? defaultPlacesLimits.places_group_limit_per_day,
      });
      setPlacesUsage((placesUsageResult.data ?? []) as PlacesUsageDay[]);
      setPlacesUsageByGroup((placesUsageByGroupResult.data ?? []) as PlacesUsageGroup[]);
      setSelectedGroupId((current) =>
        current && nextGroups.some((group) => group.id === current)
          ? current
          : (nextGroups[0]?.id ?? ""),
      );
    } catch (loadError) {
      setError(
        loadError instanceof Error
          ? loadError.message
          : "Global admin data could not be loaded.",
      );
    } finally {
      if (!retryScheduled) setLoading(false);
      adminLoadInFlight.current = false;
    }
  }

  useEffect(() => {
    void load();
    const supabase = createClient();
    const { data: listener } = supabase.auth.onAuthStateChange((event) => {
      if (event === "INITIAL_SESSION" || event === "SIGNED_IN" || event === "TOKEN_REFRESHED") {
        void load();
      }
    });
    return () => {
      if (adminRetryTimer.current) window.clearTimeout(adminRetryTimer.current);
      listener.subscription.unsubscribe();
    };
  }, []);

  useEffect(() => {
    const term = adminSearch.trim();
    if (!authorized || term.length < 2) {
      setAdminCandidates([]);
      setAdminSearchLoading(false);
      setAdminSearchError("");
      return;
    }
    let cancelled = false;
    setAdminSearchLoading(true);
    setAdminSearchError("");
    const timer = window.setTimeout(() => {
      void (async () => {
        const { data, error: searchError } = await createClient().rpc(
          "search_site_lunch_loop_users",
          { search_term: term },
        );
        if (cancelled) return;
        if (searchError) {
          setAdminCandidates([]);
          setAdminSearchError("User search could not be completed.");
        } else {
          setAdminCandidates(
            ((data ?? []) as AdminUserSearchResult[]).filter(
              (candidate) =>
                !siteAdmins.some((admin) => admin.user_id === candidate.user_id),
            ),
          );
        }
        setAdminSearchLoading(false);
      })();
    }, 250);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [adminSearch, authorized, siteAdmins]);

  const selectedGroup =
    groups.find((group) => group.id === selectedGroupId) ?? null;
  const selectedMembers = useMemo(
    () =>
      members
        .filter((member) => member.group_id === selectedGroupId)
        .sort((a, b) => a.rotation_order - b.rotation_order),
    [members, selectedGroupId],
  );
  const selectedRestaurants = useMemo(
    () =>
      restaurants.filter(
        (restaurant) => restaurant.group_id === selectedGroupId,
      ),
    [restaurants, selectedGroupId],
  );
  const selectedSessions = useMemo(
    () => sessions.filter((session) => session.group_id === selectedGroupId),
    [sessions, selectedGroupId],
  );
  const filteredGroups = useMemo(() => {
    const term = search.trim().toLowerCase();
    return term
      ? groups.filter((group) =>
          `${group.name} ${group.status}`
            .toLowerCase()
            .includes(term),
        )
      : groups;
  }, [groups, search]);
  const activeLoops = sessions.filter(
    (session) => session.status === "active" || session.status === "chosen",
  );
  const totalMembers = new Set(members.map((member) => member.user_id)).size;
  const totalOwners = new Set(
    members.filter((member) => member.role === "owner").map((member) => member.user_id),
  ).size;
  const peopleInMultipleLoops = useMemo(() => {
    const membershipCounts = new Map<string, number>();
    members.forEach((member) => {
      membershipCounts.set(member.user_id, (membershipCounts.get(member.user_id) ?? 0) + 1);
    });
    return [...membershipCounts.values()].filter((count) => count > 1).length;
  }, [members]);
  const retiredRestaurants = restaurants.filter((restaurant) => restaurant.never_again).length;
  const restaurantsById = useMemo(
    () => new Map(restaurants.map((restaurant) => [restaurant.id, restaurant])),
    [restaurants],
  );
  const groupsById = useMemo(
    () => new Map(groups.map((group) => [group.id, group])),
    [groups],
  );
  const decisionLocations = useMemo(
    () => [...new Set(groups.map((group) => group.home_label).filter((label): label is string => Boolean(label)))].sort(),
    [groups],
  );
  const winningDecisions = useMemo(
    () => sessions
      .filter((session) => session.status === "completed" && session.final_restaurant_id)
      .map((session) => ({
        session,
        restaurant: restaurantsById.get(session.final_restaurant_id!),
        group: groupsById.get(session.group_id),
      }))
      .filter((decision) => !decisionLocation || decision.group?.home_label === decisionLocation),
    [decisionLocation, groupsById, restaurantsById, sessions],
  );

  function showSummary(view: SummaryView) {
    setSummaryView((current) => (current === view ? null : view));
  }

  useEffect(() => {
    if (!selectedGroup) return;
    setGroupName(selectedGroup.name);
    setGroupStatus(selectedGroup.status);
    setSuspensionReason(selectedGroup.suspended_reason ?? "");
  }, [selectedGroup]);

  async function run(action: () => Promise<void>, successMessage: string) {
    setBusy(true);
    setMessage("");
    setError("");
    try {
      await action();
      setMessage(successMessage);
      await load();
    } catch (actionError) {
      setError(actionErrorMessage(actionError, "That global admin action could not be completed."));
    } finally {
      setBusy(false);
    }
  }

  function saveSiteSettings() {
    void run(
      async () => {
        const { error: updateError } = await createClient().rpc(
          "global_admin_update_site_settings",
          { new_allow_new_groups: allowNewGroups },
        );
        if (updateError) throw updateError;
      },
      allowNewGroups
        ? "New lunch-loop creation is enabled."
        : "New lunch-loop creation is paused.",
    );
  }
  function saveDonations() {
    void run(
      async () => {
        const { error: updateError } = await createClient().rpc(
          "global_admin_set_donations_enabled",
          { new_enabled: donationsEnabled },
        );
        if (updateError) throw updateError;
      },
      donationsEnabled
        ? "The donation link is on. It stays optional and does not change restaurant selection."
        : "The donation link is off.",
    );
  }
  function saveFeedbackWebhook() {
    void run(
      async () => {
        const { error: updateError } = await createClient().rpc(
          "global_admin_set_feedback_webhook_enabled",
          { new_enabled: feedbackWebhookEnabled },
        );
        if (updateError) throw updateError;
      },
      feedbackWebhookEnabled
        ? "Feedback alerts are enabled. They still skip quietly when the vault secrets are missing."
        : "Feedback alerts are paused. The email fallback still sends without the reporter email.",
    );
  }
  function saveMemberInviteLimit() {
    void run(
      async () => {
        const parsed = memberInviteLimit.trim()
          ? Number(memberInviteLimit)
          : null;
        if (parsed !== null && (!Number.isInteger(parsed) || parsed < 1 || parsed > 1000)) {
          throw new Error("Set a whole-number daily limit between 1 and 1,000, or leave it blank for no limit.");
        }
        const { error: limitError } = await createClient().rpc(
          "global_admin_update_member_invite_limit",
          { new_limit: parsed },
        );
        if (limitError) throw limitError;
      },
      memberInviteLimit.trim() ? "Daily crew-invite limit saved." : "Crew invitations are currently unlimited.",
    );
  }
  function saveOwnedLoopLimit() {
    void run(
      async () => {
        if (!Number.isInteger(ownedLoopLimit) || ownedLoopLimit < 1 || ownedLoopLimit > 20) {
          throw new Error("Set an owned-loop limit from 1 to 20.");
        }
        const { error: limitError } = await createClient().rpc(
          "global_admin_update_owned_loop_limit",
          { new_limit: ownedLoopLimit },
        );
        if (limitError) throw limitError;
      },
      `People can now own up to ${ownedLoopLimit} active Lunch Loops.`,
    );
  }
  function savePlacesLimits() {
    void run(async () => {
      const values = Object.values(placesLimits);
      if (values.some((value) => !Number.isInteger(value) || value < 1)) {
        throw new Error("Every Places limit must be a whole number of at least 1.");
      }
      const { error: limitError } = await createClient().rpc(
        "global_admin_update_places_usage_limits",
        {
          new_place_search_user_limit_10m: placesLimits.place_search_user_limit_10m,
          new_place_search_group_limit_10m: placesLimits.place_search_group_limit_10m,
          new_place_detail_user_limit_10m: placesLimits.place_detail_user_limit_10m,
          new_place_detail_group_limit_10m: placesLimits.place_detail_group_limit_10m,
          new_area_search_user_limit_10m: placesLimits.area_search_user_limit_10m,
          new_places_user_limit_per_day: placesLimits.places_user_limit_per_day,
          new_places_group_limit_per_day: placesLimits.places_group_limit_per_day,
        },
      );
      if (limitError) throw limitError;
    }, "Persistent Google Places usage limits saved.");
  }
  function saveGroup() {
    if (!selectedGroup) return;
    void run(
      async () => {
        const { error: updateError } = await createClient().rpc(
          "global_admin_update_group",
          {
            target_group: selectedGroup.id,
            new_name: groupName,
            new_status: groupStatus,
            new_suspension_reason: suspensionReason,
            regenerate_invite: false,
          },
        );
        if (updateError) throw updateError;
      },
      "Group settings saved.",
    );
  }
  function setOwner(userId: string) {
    if (!selectedGroup) return;
    void run(async () => {
      const { error: updateError } = await createClient().rpc(
        "global_admin_set_group_owner",
        { target_group: selectedGroup.id, target_user: userId },
      );
      if (updateError) throw updateError;
    }, "Group owner updated.");
  }
  function removeMember(member: AdminMember) {
    if (
      !selectedGroup ||
      !window.confirm(
        `Remove ${member.profiles?.display_name ?? "this person"} from ${selectedGroup.name}?`,
      )
    )
      return;
    void run(async () => {
      const { error: removeError } = await createClient().rpc(
        "global_admin_remove_group_member",
        { target_group: selectedGroup.id, target_user: member.user_id },
      );
      if (removeError) throw removeError;
    }, "Member removed from the lunch loop.");
  }
  function toggleRestaurant(restaurant: AdminRestaurant) {
    void run(
      async () => {
        const { error: updateError } = await createClient()
          .from("restaurants")
          .update({ never_again: !restaurant.never_again })
          .eq("id", restaurant.id);
        if (updateError) throw updateError;
      },
      restaurant.never_again
        ? "Restaurant restored to its group’s rotation."
        : "Restaurant retired from its group’s rotation.",
    );
  }
  function removeRestaurant(restaurant: AdminRestaurant) {
    if (
      !window.confirm(
        `Permanently remove ${restaurant.name}? This cannot be undone.`,
      )
    )
      return;
    void run(async () => {
      const { error: deleteError } = await createClient()
        .from("restaurants")
        .delete()
        .eq("id", restaurant.id);
      if (deleteError) throw deleteError;
    }, "Restaurant permanently removed.");
  }
  function cancelSession(session: AdminSession) {
    if (
      !window.confirm(
        "Cancel this active lunch loop? Its selections and vetoes stay in the audit record, but the group can start again.",
      )
    )
      return;
    void run(async () => {
      const { error: cancelError } = await createClient().rpc(
        "global_admin_cancel_lunch_session",
        { target_session: session.id },
      );
      if (cancelError) throw cancelError;
    }, "Active lunch loop cancelled.");
  }
  function deleteLunchLoop() {
    if (!selectedGroup) return;
    setDeleteConfirmation("");
    setDeleteConfirmationError("");
    setDeleteDialogOpen(true);
  }
  async function confirmLunchLoopDeletion() {
    if (!selectedGroup) return;
    if (deleteConfirmation.trim() !== selectedGroup.name) {
      setDeleteConfirmationError(`Type “${selectedGroup.name}” exactly to enable deletion.`);
      return;
    }
    setBusy(true);
    setDeleteConfirmationError("");
    setError("");
    setMessage("");
    try {
      const { error: deleteError } = await createClient().rpc(
        "global_admin_permanently_delete_lunch_loop",
        { target_group: selectedGroup.id, confirmation_name: deleteConfirmation.trim() },
      );
      if (deleteError) throw deleteError;
      setDeleteDialogOpen(false);
      setDeleteConfirmation("");
      setMessage(`“${selectedGroup.name}” was permanently deleted.`);
      await load();
    } catch (deleteError) {
      setDeleteConfirmationError(
        actionErrorMessage(deleteError, "The Lunch Loop could not be deleted. Nothing was changed."),
      );
    } finally {
      setBusy(false);
    }
  }
  function grantAdmin() {
    if (!newAdmin) return;
    void run(async () => {
      const { error: adminError } = await createClient().rpc(
        "global_admin_set_site_admin",
        { target_user: newAdmin.user_id, make_admin: true },
      );
      if (adminError) throw adminError;
      setNewAdmin(null);
      setAdminSearch("");
      setAdminCandidates([]);
    }, "Global administrator added.");
  }
  function removeAdmin(admin: SiteAdmin) {
    if (
      !window.confirm(
        `Remove global admin access for ${admin.profiles?.display_name ?? "this person"}?`,
      )
    )
      return;
    void run(async () => {
      const { error: adminError } = await createClient().rpc(
        "global_admin_set_site_admin",
        { target_user: admin.user_id, make_admin: false },
      );
      if (adminError) throw adminError;
    }, "Global administrator removed.");
  }
  function updateInviteRequest(
    request: InviteRequest,
    status: InviteRequest["status"],
  ) {
    void run(
      async () => {
        const { error: requestError } = await createClient().rpc(
          "global_admin_update_lunch_loop_invite_request",
          {
            target_request: request.id,
            new_status: status,
            new_review_note: request.review_note,
          },
        );
        if (requestError) throw requestError;
      },
      "Invite request marked " + status + ".",
    );
  }
  function updateFeedback(
    item: FeedbackItem,
    changes: Partial<Pick<FeedbackItem, "status" | "priority" | "admin_note" | "reporter_note">>,
  ) {
    const next = { ...item, ...changes };
    void run(
      async () => {
        const { error: feedbackError } = await createClient().rpc(
          "update_site_lunch_loop_feedback",
          {
            target_feedback: item.id,
            new_status: next.status,
            new_priority: next.priority,
            new_admin_note: next.admin_note,
            new_duplicate_of: next.duplicate_of,
            new_reporter_note: next.reporter_note,
          },
        );
        if (feedbackError) throw feedbackError;
      },
      "Feedback item updated.",
    );
  }
  function deleteFeedback(item: FeedbackItem) {
    if (!window.confirm(`Delete feedback “${item.title}”? This permanently removes it from the site queue.`)) return;
    void run(async () => {
      const { error: feedbackError } = await createClient().rpc(
        "delete_site_lunch_loop_feedback",
        { target_feedback: item.id },
      );
      if (feedbackError) throw feedbackError;
    }, "Feedback item permanently deleted.");
  }
  async function copyInviteEmail(request: InviteRequest) {
    if (!request.account_email) {
      setError("This request does not have an email address to copy.");
      return;
    }
    try {
      await navigator.clipboard.writeText(request.account_email);
      setMessage("Copied " + request.account_email + ".");
    } catch {
      setMessage(request.account_email);
    }
  }
  async function createCrewForRequest(request: InviteRequest) {
    const proposedName = window.prompt(
      "Name this new private Lunch Loop. The requester will become its owner.",
      request.display_name
        ? request.display_name + "'s Lunch Loop"
        : "New Lunch Loop",
    );
    if (!proposedName?.trim()) return;
    setBusy(true);
    setMessage("");
    setError("");
    try {
      const { error: createError } = await createClient().rpc(
        "global_admin_create_lunch_group_for_request",
        {
          target_user: request.user_id,
          new_group_name: proposedName.trim(),
        },
      );
      if (createError) throw createError;
      setMessage(
        "Crew created for " +
          request.display_name +
          ". They are the owner and can send one-time crew invitations from Settings.",
      );
      await load();
    } catch (createError) {
      setError(
        createError instanceof Error
          ? createError.message
          : "The new Lunch Loop could not be created.",
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <AppFrame>
      <p className="text-sm font-bold uppercase tracking-widest text-orange-600">
        Site controls
      </p>
      <h1 className="mt-1 text-3xl font-black tracking-tight">Global admin</h1>
      <p className="mt-2 max-w-3xl text-stone-600">
        Manage Lunch Loop as a whole. These controls work across every group
        while preserving each group’s own restaurant history and audit trail.
      </p>
      {error && (
        <p
          role="alert"
          className="mt-5 rounded-xl bg-rose-50 px-4 py-3 text-sm font-semibold text-rose-700"
        >
          {error}
        </p>
      )}
      {message && (
        <p
          role="status"
          className="mt-5 rounded-xl bg-emerald-50 px-4 py-3 text-sm font-semibold text-emerald-700"
        >
          {message}
        </p>
      )}
      {loading ? (
        <p className="mt-6 text-sm font-semibold text-stone-500">
          Loading site controls…
        </p>
      ) : !authorized ? (
        <div className="mt-6">
          <EmptyState emoji="🔒" title="Global admin access required">
            This page is only available to a designated Lunch Loop site
            administrator.
          </EmptyState>
        </div>
      ) : (
        <>
          <section className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
            <SummaryCard active={summaryView === "loops"} label="Lunch Loops" value={groups.length} detail="View loop health" onClick={() => showSummary("loops")} tone="orange" />
            <SummaryCard active={summaryView === "people"} label="People" value={totalMembers} detail="View membership" onClick={() => showSummary("people")} />
            <SummaryCard active={summaryView === "restaurants"} label="Restaurants" value={restaurants.length} detail="View database health" onClick={() => showSummary("restaurants")} />
            <SummaryCard active={summaryView === "in-progress"} label="Decisions in progress" value={activeLoops.length} detail="Awaiting a winner" onClick={() => showSummary("in-progress")} />
            <SummaryCard active={summaryView === "decisions"} label="Completed decisions" value={sessions.filter((session) => session.status === "completed").length} detail="View winning picks" onClick={() => showSummary("decisions")} />
          </section>
          {summaryView && <div
            role="presentation"
            className="fixed inset-0 z-50 flex items-end bg-stone-950/35 p-3 backdrop-blur-sm sm:items-center sm:justify-center sm:p-6"
            onMouseDown={() => setSummaryView(null)}
          >
            <section
              role="dialog"
              aria-modal="true"
              aria-label="Global Admin report"
              className="max-h-[85dvh] w-full max-w-3xl overflow-y-auto rounded-3xl bg-white p-5 shadow-2xl sm:p-7"
              onMouseDown={(event) => event.stopPropagation()}
            >
              <div className="mb-5 flex items-center justify-between gap-4 border-b border-orange-100 pb-4">
                <div>
                  <p className="text-xs font-bold uppercase tracking-widest text-orange-600">Global Admin report</p>
                  <p className="mt-1 text-sm text-stone-600">A closer look without leaving the dashboard.</p>
                </div>
                <button type="button" onClick={() => setSummaryView(null)} className="rounded-xl border border-orange-200 px-3 py-2 text-sm font-black text-orange-800">Close</button>
              </div>
            {summaryView === "loops" && <><p className="text-xs font-bold uppercase tracking-widest text-orange-600">Lunch Loop overview</p><h2 className="mt-1 text-xl font-black">{groups.filter((group) => group.status === "active").length} available · {groups.filter((group) => group.status === "suspended").length} suspended</h2><p className="mt-2 text-sm text-stone-600">{groups.filter((group) => group.loop_type === "standing").length} Standing and {groups.filter((group) => group.loop_type === "occasion").length} Occasion loops. Select a loop below to manage its people, access, and data.</p></>}
            {summaryView === "people" && <><p className="text-xs font-bold uppercase tracking-widest text-orange-600">People overview</p><h2 className="mt-1 text-xl font-black">{totalMembers} people across {groups.length} Lunch Loops</h2><div className="mt-3 grid gap-3 sm:grid-cols-3"><StatFact label="Loop owners" value={totalOwners} /><StatFact label="In more than one loop" value={peopleInMultipleLoops} /><StatFact label="Average crew size" value={groups.length ? (members.length / groups.length).toFixed(1) : "0"} /></div></>}
            {summaryView === "restaurants" && <><p className="text-xs font-bold uppercase tracking-widest text-orange-600">Restaurant database overview</p><h2 className="mt-1 text-xl font-black">{restaurants.length - retiredRestaurants} active places · {retiredRestaurants} retired</h2><div className="mt-3 grid gap-2 md:grid-cols-2">{restaurants.slice().sort((a, b) => b.visit_count - a.visit_count || a.name.localeCompare(b.name)).slice(0, 6).map((restaurant) => <button key={restaurant.id} type="button" onClick={() => { setSummaryView(null); setDetailRestaurant(restaurant); }} className="rounded-2xl bg-orange-50 p-3 text-left text-sm transition hover:bg-orange-100"><strong>{restaurant.name}</strong><span className="ml-2 text-xs text-stone-600">{restaurant.visit_count} pick{restaurant.visit_count === 1 ? "" : "s"} · {groupsById.get(restaurant.group_id)?.name ?? "Lunch Loop"}</span></button>)}{!restaurants.length && <p className="text-sm text-stone-500">No restaurants have been added yet.</p>}</div></>}
            {summaryView === "in-progress" && <><p className="text-xs font-bold uppercase tracking-widest text-orange-600">Decision activity</p><h2 className="mt-1 text-xl font-black">{activeLoops.length ? "Open decisions" : "No decision is currently in progress"}</h2><div className="mt-3 space-y-2">{activeLoops.map((session) => <div key={session.id} className="rounded-2xl bg-orange-50 p-3 text-sm"><strong>{groupsById.get(session.group_id)?.name ?? "Lunch Loop"}</strong><span className="ml-2 text-stone-600">{session.status === "chosen" ? "winner selected" : "picks and vetoes underway"} · {timeLabel(session.scheduled_for)}</span></div>)}</div></>}
            {summaryView === "decisions" && <><div className="flex flex-wrap items-end justify-between gap-3"><div><p className="text-xs font-bold uppercase tracking-widest text-orange-600">Decision report</p><h2 className="mt-1 text-xl font-black">Winning restaurants</h2><p className="mt-1 text-sm text-stone-600">Completed decisions stay with their Lunch Loop; filter by home area to see local history.</p></div><label className="text-sm font-bold">Home area<select value={decisionLocation} onChange={(event) => setDecisionLocation(event.target.value)} className="ml-2 rounded-xl border border-orange-200 bg-white px-3 py-2 text-sm font-semibold"><option value="">All locations</option>{decisionLocations.map((location) => <option key={location} value={location}>{location}</option>)}</select></label></div><div className="mt-3 max-h-80 space-y-2 overflow-y-auto pr-1">{winningDecisions.map(({ session, restaurant, group }) => restaurant ? <button key={session.id} type="button" onClick={() => { setSummaryView(null); setDetailRestaurant(restaurant); }} className="flex w-full flex-wrap items-center justify-between gap-2 rounded-2xl bg-orange-50 p-3 text-left text-sm transition hover:bg-orange-100"><span><strong>{restaurant.name}</strong><span className="ml-2 text-stone-600">{group?.name ?? "Lunch Loop"}{group?.home_label ? ` · ${group.home_label}` : ""}</span></span><span className="text-xs font-bold text-orange-800">{timeLabel(session.scheduled_for)}</span></button> : <div key={session.id} className="rounded-2xl bg-stone-50 p-3 text-sm text-stone-500">A removed restaurant won {group?.name ?? "a Lunch Loop"} on {timeLabel(session.scheduled_for)}.</div>)}{!winningDecisions.length && <p className="text-sm text-stone-500">No completed decisions match this location yet.</p>}</div></>}
            </section>
          </div>}
          <section className="mt-6 rounded-3xl bg-orange-600 p-5 text-white shadow-xl shadow-orange-100">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div>
                <p className="text-xs font-bold uppercase tracking-widest text-orange-200">
                  Growth controls
                </p>
                <h2 className="mt-1 text-xl font-black">New lunch loops</h2>
                <p className="mt-1 max-w-xl text-sm text-orange-50">
                  Pause new group creation without affecting existing groups.
                  Sign-in remains managed in Supabase, so current members
                  can still sign in.
                </p>
              </div>
              <label className="flex items-center gap-3 rounded-2xl bg-white/10 px-4 py-3 text-sm font-bold">
                <input
                  type="checkbox"
                  checked={allowNewGroups}
                  onChange={(event) => setAllowNewGroups(event.target.checked)}
                  className="size-5 accent-orange-500"
                />
                Allow new groups
              </label>
            </div>
            <button
              type="button"
              disabled={busy}
              onClick={saveSiteSettings}
              className="mt-4 rounded-xl bg-white px-4 py-3 text-sm font-black text-orange-900 disabled:opacity-60"
            >
              Save site setting
            </button>
            <div className="mt-5 rounded-2xl bg-white/10 p-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className="font-black">Feedback alerts</p>
                  <p className="mt-1 max-w-xl text-sm text-orange-50">When this is on, a new note can alert the maintainer bot. The alert skips quietly if the vault secrets are missing, and the email fallback never includes the reporter’s email address.</p>
                </div>
                <label className="flex items-center gap-3 rounded-2xl bg-white/10 px-4 py-3 text-sm font-bold">
                  <input type="checkbox" checked={feedbackWebhookEnabled} onChange={(event) => setFeedbackWebhookEnabled(event.target.checked)} className="size-5 accent-orange-500" />
                  Send feedback alerts
                </label>
              </div>
              <button type="button" disabled={busy} onClick={saveFeedbackWebhook} className="mt-4 rounded-xl bg-white px-4 py-3 text-sm font-black text-orange-900 disabled:opacity-60">Save alert setting</button>
            </div>
            <div className="mt-5 rounded-2xl bg-white/10 p-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className="font-black">Donation link</p>
                  <p className="mt-1 max-w-xl text-sm text-orange-50">When on, the footer can show Fuel the loop, which opens the Value for Value page, and a finished pick can show a short dismissible line underneath. About one pick in three, then not again for a few days. It does not change which restaurant is chosen or unlock features.</p>
                </div>
                <label className="flex items-center gap-3 rounded-2xl bg-white/10 px-4 py-3 text-sm font-bold">
                  <input type="checkbox" checked={donationsEnabled} onChange={(event) => setDonationsEnabled(event.target.checked)} className="size-5 accent-orange-500" />
                  Show donation link
                </label>
              </div>
              <button type="button" disabled={busy} onClick={saveDonations} className="mt-4 rounded-xl bg-white px-4 py-3 text-sm font-black text-orange-900 disabled:opacity-60">Save donation setting</button>
            </div>
            <div className="mt-5 rounded-2xl bg-white/15 p-4">
              <p className="font-black">Owned Lunch Loop limit</p>
              <p className="mt-1 text-sm text-orange-50">Set the maximum number of active Lunch Loops one account may own. It applies to creation, invitation redemption, restoring an archived loop, and ownership changes.</p>
              <div className="mt-3 flex flex-wrap items-center gap-2"><input type="number" min="1" max="20" value={ownedLoopLimit} onChange={(event) => setOwnedLoopLimit(Number(event.target.value))} className="w-24 rounded-xl bg-white px-3 py-3 text-sm font-bold text-stone-900" /><span className="text-sm font-semibold text-orange-50">active loops per owner</span><button type="button" disabled={busy} onClick={saveOwnedLoopLimit} className="rounded-xl bg-white px-4 py-3 text-sm font-black text-orange-900 disabled:opacity-60">Save loop limit</button></div>
            </div>
            <div className="mt-5 rounded-2xl bg-white/10 p-4">
              <p className="font-black">Crew-invite safety valve</p>
              <p className="mt-1 text-sm text-orange-50">Invites are unlimited right now, as requested. If growth ever needs a brake, set a per-owner daily limit here. New-loop referrals stay separately controlled by their email-specific invitation flow.</p>
              <div className="mt-3 flex flex-wrap gap-2">
                <input value={memberInviteLimit} onChange={(event) => setMemberInviteLimit(event.target.value.replace(/\D/g, ""))} inputMode="numeric" placeholder="No limit" className="w-32 rounded-xl bg-white px-3 py-3 text-sm font-bold text-stone-900" />
                <button type="button" disabled={busy} onClick={saveMemberInviteLimit} className="rounded-xl bg-white px-4 py-3 text-sm font-black text-stone-900 disabled:opacity-60">Save invite limit</button>
              </div>
            </div>
            <div className="mt-5 rounded-2xl bg-white/10 p-4">
              <p className="font-black">Google Places usage and protection</p>
              <p className="mt-1 text-sm text-orange-50">
                {placesUsage.reduce((total, day) => total + Number(day.requests), 0)} protected Places requests in the last 7 days. This is Lunch Loop’s durable request log, not Google’s billing ledger.
              </p>
              <div className="mt-3 flex flex-wrap gap-2">
                <a href="https://console.cloud.google.com/google/maps-apis/metrics" target="_blank" rel="noreferrer" className="rounded-xl bg-white px-3 py-2 text-xs font-black text-stone-900">Google Maps usage ↗</a>
                <a href="https://console.cloud.google.com/google/maps-apis/quotas" target="_blank" rel="noreferrer" className="rounded-xl bg-white px-3 py-2 text-xs font-black text-stone-900">Google Maps quotas ↗</a>
                <a href="https://console.cloud.google.com/billing" target="_blank" rel="noreferrer" className="rounded-xl bg-white px-3 py-2 text-xs font-black text-stone-900">Google Cloud billing ↗</a>
              </div>
              <p className="mt-2 text-xs text-orange-50">Select the Google Cloud project that owns Lunch Loop’s Places key. Google Cloud is the source of truth for API totals, quotas, credits, and charges; this screen explains which Lunch Loops drove the protected app requests.</p>
              <div className="mt-4 grid gap-2 sm:grid-cols-3">
                {([
                  ["Restaurant searches", "place_search"],
                  ["Place details", "place_detail"],
                  ["City searches", "area_search"],
                ] as const).map(([label, action]) => (
                  <div key={action} className="rounded-xl bg-orange-700/35 p-3">
                    <p className="text-xs font-bold text-orange-100">{label}</p>
                    <p className="mt-1 text-2xl font-black">{placesUsage.filter((entry) => entry.action_name === action).reduce((total, entry) => total + Number(entry.requests), 0)}</p>
                    <p className="text-xs text-orange-50">last 7 days</p>
                  </div>
                ))}
              </div>
              <div className="mt-4 grid gap-3 md:grid-cols-2">
                <div className="rounded-xl bg-orange-700/35 p-3">
                  <p className="text-xs font-bold uppercase tracking-widest text-orange-100">Recent daily activity</p>
                  <div className="mt-2 space-y-1 text-xs text-orange-50">
                    {placesUsage.length ? placesUsage.map((entry) => (
                      <p key={`${entry.day}-${entry.action_name}`}>
                        {dateLabel(entry.day)} · {entry.action_name.replace("_", " ")} · <strong>{entry.requests}</strong> request{entry.requests === 1 ? "" : "s"} from {entry.people} person{entry.people === 1 ? "" : "s"}
                      </p>
                    )) : <p>No Google Places requests recorded in the last 7 days.</p>}
                  </div>
                </div>
                <div className="rounded-xl bg-orange-700/35 p-3">
                  <p className="text-xs font-bold uppercase tracking-widest text-orange-100">Most active lunch loops</p>
                  <div className="mt-2 space-y-1 text-xs text-orange-50">
                    {placesUsageByGroup.length ? placesUsageByGroup.slice(0, 5).map((entry) => (
                      <p key={entry.group_id}><strong>{entry.group_name}</strong> · {entry.requests} requests · {entry.place_searches} searches · {entry.place_details} details</p>
                    )) : <p>No group search activity yet.</p>}
                  </div>
                </div>
              </div>
              <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                {([
                  ["place_search_user_limit_10m", "Place searches / person / 10 min"],
                  ["place_search_group_limit_10m", "Place searches / loop / 10 min"],
                  ["place_detail_user_limit_10m", "Place details / person / 10 min"],
                  ["place_detail_group_limit_10m", "Place details / loop / 10 min"],
                  ["area_search_user_limit_10m", "City searches / person / 10 min"],
                  ["places_user_limit_per_day", "All Places / person / day"],
                  ["places_group_limit_per_day", "All Places / loop / day"],
                ] as Array<[keyof PlacesLimits, string]>).map(([key, label]) => (
                  <label key={key} className="text-xs font-bold text-orange-50">
                    {label}
                    <input type="number" min="1" value={placesLimits[key]} onChange={(event) => setPlacesLimits((current) => ({ ...current, [key]: Number(event.target.value) }))} className="mt-1 block w-full rounded-xl bg-white px-3 py-2 text-sm font-bold text-stone-900" />
                  </label>
                ))}
              </div>
              <button type="button" disabled={busy} onClick={savePlacesLimits} className="mt-4 rounded-xl bg-white px-4 py-3 text-sm font-black text-stone-900 disabled:opacity-60">Save Places limits</button>
            </div>
            <div className="mt-6 border-t border-white/15 pt-5">
              <p className="text-xs font-bold uppercase tracking-widest text-orange-200">
                Administrator access
              </p>
              <h2 className="mt-1 text-xl font-black">Global admin team</h2>
              <p className="mt-1 text-sm text-orange-50">
                Global admins can manage every group, restaurant, active loop,
                and site setting.
              </p>
              <div className="mt-3 flex flex-wrap gap-2">
                {siteAdmins.map((admin) => (
                  <div
                    key={admin.user_id}
                    className="flex items-center gap-2 rounded-xl bg-white/10 px-3 py-2 text-sm font-bold"
                  >
                    <span>
                      {admin.profiles?.display_name ?? "Lunch Loop user"}
                    </span>
                    <button
                      type="button"
                      disabled={busy || siteAdmins.length <= 1}
                      onClick={() => removeAdmin(admin)}
                      className="rounded-lg bg-white/15 px-2 py-1 text-xs text-orange-100 disabled:opacity-40"
                    >
                      Remove
                    </button>
                  </div>
                ))}
              </div>
              <div className="mt-4 max-w-xl">
                <label className="block text-sm font-bold text-orange-50">
                  Find a Lunch Loop user
                  <input
                    value={adminSearch}
                    onChange={(event) => {
                      setAdminSearch(event.target.value);
                      setNewAdmin(null);
                    }}
                    placeholder="Search full name or email"
                    autoComplete="off"
                    className="mt-2 w-full rounded-xl bg-white px-3 py-3 text-sm font-bold text-stone-900 outline-none focus:ring-2 focus:ring-orange-200"
                  />
                </label>
                <p className="mt-1 text-xs text-orange-50">
                  Type at least two characters. Results are limited to 20 and
                  visible only to Global Admins.
                </p>
                {adminSearchLoading && (
                  <p className="mt-2 text-xs font-bold text-orange-100">
                    Searching Lunch Loop accounts…
                  </p>
                )}
                {adminSearchError && (
                  <p className="mt-2 text-xs font-bold text-rose-200">
                    {adminSearchError}
                  </p>
                )}
                {adminCandidates.length > 0 && !newAdmin && (
                  <div className="mt-2 overflow-hidden rounded-2xl bg-white text-stone-900 shadow-lg">
                    {adminCandidates.map((candidate) => (
                      <button
                        key={candidate.user_id}
                        type="button"
                        onClick={() => {
                          setNewAdmin(candidate);
                          setAdminSearch("");
                          setAdminCandidates([]);
                        }}
                        className="block w-full border-b border-stone-100 px-4 py-3 text-left text-sm transition last:border-0 hover:bg-orange-50"
                      >
                        <span className="block font-black">
                          {candidate.display_name}
                        </span>
                        <span className="block text-xs text-stone-500">
                          {candidate.google_full_name && candidate.google_full_name !== candidate.display_name ? `Google name: ${candidate.google_full_name} · ` : ""}{candidate.account_email ?? "Account email unavailable"}
                        </span>
                      </button>
                    ))}
                  </div>
                )}
                {adminSearch.trim().length >= 2 && !adminSearchLoading && !newAdmin && !adminCandidates.length && !adminSearchError && (
                  <p className="mt-2 text-xs text-orange-50">
                    No non-admin Lunch Loop users matched that search.
                  </p>
                )}
                {newAdmin && (
                  <div className="mt-3 flex flex-wrap items-center justify-between gap-3 rounded-2xl bg-white/15 px-4 py-3">
                    <p className="text-sm">
                      Ready to add <strong>{newAdmin.display_name}</strong>
                      {newAdmin.google_full_name && newAdmin.google_full_name !== newAdmin.display_name ? ` · Google name: ${newAdmin.google_full_name}` : ""}{newAdmin.account_email ? ` · ${newAdmin.account_email}` : ""}
                    </p>
                    <button
                      type="button"
                      onClick={() => setNewAdmin(null)}
                      className="text-xs font-bold text-orange-100 underline"
                    >
                      Choose someone else
                    </button>
                  </div>
                )}
                <button
                  type="button"
                  disabled={busy || !newAdmin}
                  onClick={grantAdmin}
                  className="mt-3 rounded-xl bg-white px-4 py-3 text-sm font-black text-stone-900 disabled:opacity-50"
                >
                  Add global admin
                </button>
              </div>
            </div>
          </section>
          <section className="mt-7 rounded-3xl bg-white p-5 shadow-sm">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <p className="text-xs font-bold uppercase tracking-widest text-orange-600">
                  Access requests
                </p>
                <h2 className="mt-1 text-xl font-black">Invite requests</h2>
                <p className="mt-1 max-w-2xl text-sm text-stone-500">
                  Requests are tied to a signed-in Lunch Loop account, so
                  the queue is more useful than an open public email form. Mark
                  a request invited after you send the person their next step.
                </p>
              </div>
              <span className="rounded-full bg-orange-100 px-3 py-1 text-xs font-black text-orange-900">
                {
                  inviteRequests.filter((request) => request.status === "new")
                    .length
                }{" "}
                new
              </span>
            </div>
            <div className="mt-4 max-h-[30rem] space-y-3 overflow-y-auto pr-1">
              {inviteRequests.length ? (
                inviteRequests.map((request) => (
                  <article
                    key={request.id}
                    className="rounded-2xl bg-stone-50 p-4 ring-1 ring-stone-100"
                  >
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <h3 className="font-black">
                            {request.display_name || "Lunch Loop user"}
                          </h3>
                          <span className="rounded-full bg-white px-2 py-1 text-xs font-bold text-stone-600 ring-1 ring-stone-200">
                            {request.status}
                          </span>
                        </div>
                        <p className="mt-1 break-all text-sm text-stone-600">
                          {request.account_email ??
                            "Account email unavailable"}
                        </p>
                        <p className="mt-1 text-xs text-stone-500">
                          Requested {timeLabel(request.requested_at)} ·{" "}
                          {request.auth_provider ?? "account"} sign-in
                        </p>
                        {request.note && (
                          <p className="mt-3 rounded-xl bg-white p-3 text-sm leading-6 text-stone-700">
                            “{request.note}”
                          </p>
                        )}
                      </div>
                      <div className="flex flex-wrap gap-2">
                        <button
                          type="button"
                          disabled={busy || !request.account_email}
                          onClick={() => void copyInviteEmail(request)}
                          className="rounded-lg bg-white px-3 py-2 text-xs font-bold text-stone-800 ring-1 ring-stone-200 disabled:opacity-50"
                        >
                          Copy email
                        </button>
                        {request.status === "new" && (
                          <button
                            type="button"
                            disabled={busy}
                            onClick={() =>
                              updateInviteRequest(request, "reviewed")
                            }
                            className="rounded-lg bg-amber-100 px-3 py-2 text-xs font-bold text-amber-900 disabled:opacity-50"
                          >
                            Mark reviewed
                          </button>
                        )}
                        {(request.status === "new" ||
                          request.status === "reviewed") && (
                          <button
                            type="button"
                            disabled={busy}
                            onClick={() => void createCrewForRequest(request)}
                            className="rounded-lg bg-emerald-600 px-3 py-2 text-xs font-bold text-white disabled:opacity-50"
                          >
                            Create crew
                          </button>
                        )}
                        {request.status !== "invited" && (
                          <button
                            type="button"
                            disabled={busy}
                            onClick={() =>
                              updateInviteRequest(request, "invited")
                            }
                            className="rounded-lg bg-orange-500 px-3 py-2 text-xs font-bold text-white disabled:opacity-50"
                          >
                            Mark invited
                          </button>
                        )}
                        {request.status !== "declined" && (
                          <button
                            type="button"
                            disabled={busy}
                            onClick={() =>
                              updateInviteRequest(request, "declined")
                            }
                            className="rounded-lg bg-stone-200 px-3 py-2 text-xs font-bold text-stone-700 disabled:opacity-50"
                          >
                            Decline
                          </button>
                        )}
                        {request.status !== "spam" && (
                          <button
                            type="button"
                            disabled={busy}
                            onClick={() => updateInviteRequest(request, "spam")}
                            className="rounded-lg bg-rose-50 px-3 py-2 text-xs font-bold text-rose-700 disabled:opacity-50"
                          >
                            Mark spam
                          </button>
                        )}
                      </div>
                    </div>
                  </article>
                ))
              ) : (
                <p className="rounded-2xl bg-stone-50 p-4 text-sm text-stone-500">
                  No invite requests yet. The landing page directs interested
                  people through sign-in before they can join this queue.
                </p>
              )}
            </div>
          </section>
          <section className="mt-7 rounded-3xl bg-white p-5 shadow-sm">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <p className="text-xs font-bold uppercase tracking-widest text-orange-600">Product queue</p>
                <h2 className="mt-1 text-xl font-black">Feedback and feature requests</h2>
                <p className="mt-1 max-w-2xl text-sm text-stone-500">A signed-in member supplied each note. Keep an internal implementation note if helpful, and add a friendly update the reporter will see when their fix ships.</p>
              </div>
              <span className="rounded-full bg-orange-100 px-3 py-1 text-xs font-black text-orange-900">{feedbackItems.filter((item) => item.status === "new").length} new</span>
            </div>
            <div className="mt-4 max-h-[42rem] space-y-3 overflow-y-auto pr-1">
              {feedbackItems.length ? feedbackItems.map((item) => (
                <article key={item.id} className="rounded-2xl bg-stone-50 p-4 ring-1 ring-stone-100">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2"><span className="rounded-full bg-white px-2 py-1 text-xs font-black text-stone-600 ring-1 ring-stone-200">{item.kind}</span><h3 className="font-black">{item.title}</h3></div>
                      <p className="mt-3 whitespace-pre-wrap text-sm leading-6 text-stone-700">{item.details}</p>
                      <p className="mt-3 text-xs leading-5 text-stone-500">From {item.display_name}{item.account_email ? ` · ${item.account_email}` : ""}{item.group_name ? ` · ${item.group_name}` : ""} · {timeLabel(item.created_at)}{item.page_path ? ` · ${item.page_path}` : ""}{item.build ? ` · build ${item.build}` : ""}{item.credit_opt_in && item.credit_name ? ` · release-note credit: ${item.credit_name}` : " · no public credit"}{item.notified_at ? ` · alert queued ${timeLabel(item.notified_at)}` : ""}</p>
                    </div>
                    <div className="flex shrink-0 flex-wrap gap-2">
                      <select value={item.status} disabled={busy} onChange={(event) => updateFeedback(item, { status: event.target.value as FeedbackItem["status"] })} className="rounded-lg border border-stone-200 bg-white px-2 py-2 text-xs font-bold"><option value="new">New</option><option value="triaged">Triaged</option><option value="planned">Planned</option><option value="in_progress">In progress</option><option value="shipped">Shipped</option><option value="declined">Declined</option><option value="duplicate">Duplicate</option></select>
                      <select value={item.priority} disabled={busy} onChange={(event) => updateFeedback(item, { priority: event.target.value as FeedbackItem["priority"] })} className="rounded-lg border border-stone-200 bg-white px-2 py-2 text-xs font-bold"><option value="low">Low</option><option value="normal">Normal</option><option value="high">High</option><option value="urgent">Urgent</option></select>
                      <button type="button" disabled={busy} onClick={() => deleteFeedback(item)} className="rounded-lg bg-rose-50 px-3 py-2 text-xs font-bold text-rose-700 disabled:opacity-50">Delete</button>
                    </div>
                  </div>
                  <label className="mt-3 block text-xs font-bold text-stone-600">Internal implementation note
                    <textarea defaultValue={item.admin_note ?? ""} maxLength={2000} rows={2} onBlur={(event) => { if (event.target.value !== (item.admin_note ?? "")) updateFeedback(item, { admin_note: event.target.value }); }} placeholder="Why this matters, decision made, or a useful implementation note…" className="mt-1 w-full rounded-xl border border-stone-200 bg-white px-3 py-2 text-sm font-normal outline-none focus:ring-2 focus:ring-orange-300" />
                  </label>
                  <label className="mt-3 block text-xs font-bold text-stone-600">Update for the reporter
                    <textarea defaultValue={item.reporter_note ?? ""} maxLength={2000} rows={2} onBlur={(event) => { if (event.target.value !== (item.reporter_note ?? "")) updateFeedback(item, { reporter_note: event.target.value }); }} placeholder="What changed, in plain language? This is shown to the person who sent the feedback." className="mt-1 w-full rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm font-normal outline-none focus:ring-2 focus:ring-emerald-300" />
                  </label>
                </article>
              )) : <p className="rounded-2xl bg-stone-50 p-4 text-sm text-stone-500">No feedback yet. Signed-in members can use Feedback / Report a bug.</p>}
            </div>
          </section>
          <section className="mt-7 grid gap-5 lg:grid-cols-[minmax(0,0.8fr)_minmax(0,1.2fr)]">
            <div className="rounded-3xl bg-white p-5 shadow-sm">
              <div className="flex flex-wrap items-end justify-between gap-3">
                <div>
                  <h2 className="text-lg font-black">All lunch loops</h2>
                  <p className="mt-1 text-sm text-stone-500">
                    Suspend is reversible and blocks group access and new joins.
                  </p>
                </div>
                <span className="text-xs font-bold text-stone-400">
                  {filteredGroups.length} shown
                </span>
              </div>
              <input
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Search name, invite code, or status…"
                className="mt-4 w-full rounded-xl border border-orange-200 px-3 py-3 text-sm outline-none focus:ring-2 focus:ring-orange-300"
                aria-label="Search lunch loops"
              />
              <div className="mt-3 max-h-[32rem] space-y-2 overflow-y-auto pr-1">
                {filteredGroups.map((group) => {
                  const memberCount = members.filter(
                    (member) => member.group_id === group.id,
                  ).length;
                  const restaurantCount = restaurants.filter(
                    (restaurant) => restaurant.group_id === group.id,
                  ).length;
                  return (
                    <button
                      key={group.id}
                      type="button"
                      onClick={() => setSelectedGroupId(group.id)}
                      className={`w-full rounded-2xl border p-4 text-left transition ${selectedGroupId === group.id ? "border-orange-400 bg-orange-50" : "border-stone-100 hover:border-orange-200"}`}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <strong>{group.name}</strong>
                        <span
                          className={`rounded-full px-2 py-1 text-xs font-bold ${group.status === "active" ? "bg-emerald-100 text-emerald-800" : "bg-rose-100 text-rose-800"}`}
                        >
                        {group.status}
                        </span>
                      </div>
                      <p className="mt-1 text-xs text-stone-500">
                        {group.loop_type === "occasion" ? "Occasion" : "Standing"} · {memberCount} member{memberCount === 1 ? "" : "s"} ·{" "}
                        {restaurantCount} places · created{" "}
                        {dateLabel(group.created_at)}
                      </p>
                      {group.suspended_reason && (
                        <p className="mt-2 text-xs font-semibold text-rose-700">
                          Reason: {group.suspended_reason}
                        </p>
                      )}
                    </button>
                  );
                })}
              </div>
            </div>
            <div>
              {selectedGroup ? (
                <div className="rounded-3xl bg-white p-5 shadow-sm">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <p className="text-xs font-bold uppercase tracking-widest text-orange-600">
                        Managing lunch loop
                      </p>
                      <h2 className="mt-1 text-2xl font-black">
                        {selectedGroup.name}
                      </h2>
                      <p className="mt-1 text-sm text-stone-500">
                        {selectedGroup.loop_type === "occasion" ? "✨ Occasion · members start each night manually" : "🔁 Standing · completed meals rotate the picker"}
                      </p>
                    </div>
                    <span
                      className={`rounded-full px-3 py-1 text-xs font-bold ${selectedGroup.status === "active" ? "bg-emerald-100 text-emerald-800" : "bg-rose-100 text-rose-800"}`}
                    >
                      {selectedGroup.status}
                    </span>
                  </div>
                  <div className="mt-5 grid gap-3 sm:grid-cols-2">
                    <label className="text-sm font-bold">
                      Group name
                      <input
                        value={groupName}
                        onChange={(event) => setGroupName(event.target.value)}
                        className="mt-1 w-full rounded-xl border border-orange-200 px-3 py-3"
                      />
                    </label>
                    <label className="text-sm font-bold">
                      Access
                      <select
                        value={groupStatus}
                        onChange={(event) =>
                          setGroupStatus(
                            event.target.value as "active" | "suspended",
                          )
                        }
                        className="mt-1 w-full rounded-xl border border-orange-200 bg-white px-3 py-3"
                      >
                        <option value="active">Active</option>
                        <option value="suspended">Suspended</option>
                      </select>
                    </label>
                  </div>
                  {groupStatus === "suspended" && (
                    <label className="mt-3 block text-sm font-bold">
                      Suspension reason (shown to administrators)
                      <input
                        value={suspensionReason}
                        onChange={(event) =>
                          setSuspensionReason(event.target.value)
                        }
                        placeholder="Optional reason"
                        className="mt-1 w-full rounded-xl border border-orange-200 px-3 py-3"
                      />
                    </label>
                  )}
                  <div className="mt-4 flex flex-wrap gap-2">
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => saveGroup()}
                      className="rounded-xl bg-orange-500 px-4 py-3 text-sm font-black text-white disabled:opacity-60"
                    >
                      Save group
                    </button>
                  </div>
                  <div className="mt-7 rounded-2xl border border-rose-200 bg-rose-50 p-4">
                    <h3 className="font-black text-rose-900">Permanent deletion</h3>
                    <p className="mt-1 max-w-xl text-sm leading-6 text-rose-800">
                      Use this only for test loops or a verified removal request.
                      It immediately removes this Lunch Loop and all of its
                      restaurants, picks, vetoes, invitations, notifications,
                      and history. This cannot be undone.
                    </p>
                    <button
                      type="button"
                      disabled={busy}
                      onClick={deleteLunchLoop}
                      className="mt-3 rounded-xl bg-rose-700 px-4 py-3 text-sm font-black text-white disabled:opacity-50"
                    >
                      Permanently delete this Lunch Loop
                    </button>
                  </div>
                  <div className="mt-7 border-t border-stone-100 pt-5">
                    <h3 className="text-lg font-black">People and ownership</h3>
                    <p className="mt-1 text-sm text-stone-500">
                      Assign one owner before removing the current owner.
                    </p>
                    <div className="mt-3 space-y-2">
                      {selectedMembers.map((member) => (
                        <div
                          key={member.user_id}
                          className="flex flex-wrap items-center justify-between gap-3 rounded-2xl bg-stone-50 p-3"
                        >
                          <div>
                            <strong>
                              {member.profiles?.display_name ?? "Lunch friend"}
                            </strong>
                            <p className="text-xs text-stone-500">
                              #{member.rotation_order + 1} in rotation ·{" "}
                              {member.role}
                            </p>
                          </div>
                          <div className="flex gap-2">
                            <button
                              type="button"
                              disabled={busy || member.role === "owner"}
                              onClick={() => setOwner(member.user_id)}
                              className="rounded-lg bg-orange-100 px-3 py-2 text-xs font-bold text-orange-900 disabled:opacity-50"
                            >
                              Make owner
                            </button>
                            <button
                              type="button"
                              disabled={busy}
                              onClick={() => removeMember(member)}
                              className="rounded-lg bg-rose-50 px-3 py-2 text-xs font-bold text-rose-700 disabled:opacity-50"
                            >
                              Remove
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                  <div className="mt-7 border-t border-stone-100 pt-5">
                    <h3 className="text-lg font-black">
                      Active or scheduled loops
                    </h3>
                    {selectedSessions.filter(
                      (session) =>
                        session.status === "active" ||
                        session.status === "chosen",
                    ).length ? (
                      <div className="mt-3 space-y-2">
                        {selectedSessions
                          .filter(
                            (session) =>
                              session.status === "active" ||
                              session.status === "chosen",
                          )
                          .map((session) => (
                            <div
                              key={session.id}
                              className="flex flex-wrap items-center justify-between gap-3 rounded-2xl bg-amber-50 p-3"
                            >
                              <div>
                                <strong className="capitalize">
                                  {session.status} loop
                                </strong>
                                <p className="text-xs text-stone-600">
                                  Scheduled {timeLabel(session.scheduled_for)}
                                </p>
                              </div>
                              <button
                                type="button"
                                disabled={busy}
                                onClick={() => cancelSession(session)}
                                className="rounded-lg bg-rose-600 px-3 py-2 text-xs font-bold text-white disabled:opacity-50"
                              >
                                Cancel loop
                              </button>
                            </div>
                          ))}
                      </div>
                    ) : (
                      <p className="mt-3 rounded-2xl bg-stone-50 p-3 text-sm text-stone-500">
                        No current lunch decision for this group.
                      </p>
                    )}
                  </div>
                  <div className="mt-7 border-t border-stone-100 pt-5">
                    <h3 className="text-lg font-black">
                      Restaurant moderation
                    </h3>
                    <p className="mt-1 text-sm text-stone-500">
                      Retire a place or permanently remove an accidental entry.
                    </p>
                    <div className="mt-3 max-h-96 space-y-2 overflow-y-auto pr-1">
                      {selectedRestaurants.length ? (
                        selectedRestaurants.map((restaurant) => (
                          <div
                            key={restaurant.id}
                            className="flex flex-wrap items-center justify-between gap-3 rounded-2xl bg-stone-50 p-3"
                          >
                            <button
                              type="button"
                              onClick={() => setDetailRestaurant(restaurant)}
                              className="text-left transition hover:text-orange-700 focus:outline-none focus:ring-2 focus:ring-orange-300"
                            >
                              <strong>{restaurant.name}</strong>
                              <p className="text-xs text-stone-500">
                                {restaurant.address} · {restaurant.visit_count}{" "}
                                picks
                              </p>
                              <p className="mt-1 text-xs font-bold text-orange-700">
                                View details and map →
                              </p>
                            </button>
                            <div className="flex gap-2">
                              <button
                                type="button"
                                disabled={busy}
                                onClick={() => toggleRestaurant(restaurant)}
                                className="rounded-lg bg-amber-100 px-3 py-2 text-xs font-bold text-amber-900 disabled:opacity-50"
                              >
                                {restaurant.never_again ? "Restore" : "Retire"}
                              </button>
                              <button
                                type="button"
                                disabled={busy}
                                onClick={() => removeRestaurant(restaurant)}
                                className="rounded-lg bg-rose-50 px-3 py-2 text-xs font-bold text-rose-700 disabled:opacity-50"
                              >
                                Delete
                              </button>
                            </div>
                          </div>
                        ))
                      ) : (
                        <p className="rounded-2xl bg-stone-50 p-3 text-sm text-stone-500">
                          This group has no restaurants yet.
                        </p>
                      )}
                    </div>
                  </div>
                </div>
              ) : (
                <EmptyState emoji="👥" title="Choose a lunch loop">
                  Select a group from the left to manage it.
                </EmptyState>
              )}
            </div>
          </section>
          <RestaurantDetailsDialog
            restaurant={detailRestaurant}
            onClose={() => setDetailRestaurant(null)}
            addedBy={detailRestaurant?.profiles?.display_name}
          />
          {deleteDialogOpen && selectedGroup && (
            <div
              className="fixed inset-0 z-50 grid place-items-center bg-stone-950/50 p-4"
              role="dialog"
              aria-modal="true"
              aria-labelledby="delete-loop-title"
            >
              <div className="w-full max-w-lg rounded-3xl bg-white p-6 shadow-2xl">
                <p className="text-sm font-bold uppercase tracking-widest text-rose-700">
                  Permanent deletion
                </p>
                <h2 id="delete-loop-title" className="mt-1 text-2xl font-black text-stone-900">
                  Delete “{selectedGroup.name}”?
                </h2>
                <p className="mt-3 text-sm leading-6 text-stone-600">
                  This immediately removes this Lunch Loop and its restaurants,
                  picks, vetoes, invitations, Discord configuration, and history.
                  It cannot be undone.
                </p>
                <label className="mt-5 block text-sm font-bold text-stone-800">
                  Type <span className="font-black">{selectedGroup.name}</span> exactly to confirm
                  <input
                    autoFocus
                    value={deleteConfirmation}
                    onChange={(event) => {
                      setDeleteConfirmation(event.target.value);
                      setDeleteConfirmationError("");
                    }}
                    className="mt-2 w-full rounded-xl border border-rose-300 px-3 py-3 text-base"
                    placeholder={selectedGroup.name}
                  />
                </label>
                {deleteConfirmationError && (
                  <p role="alert" className="mt-3 rounded-xl bg-rose-50 px-3 py-2 text-sm font-semibold text-rose-700">
                    {deleteConfirmationError}
                  </p>
                )}
                <div className="mt-6 flex flex-wrap justify-end gap-3">
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => setDeleteDialogOpen(false)}
                    className="rounded-xl bg-stone-100 px-4 py-3 text-sm font-black text-stone-700 disabled:opacity-50"
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    disabled={busy || deleteConfirmation.trim() !== selectedGroup.name}
                    onClick={() => void confirmLunchLoopDeletion()}
                    className="rounded-xl bg-rose-700 px-4 py-3 text-sm font-black text-white disabled:cursor-not-allowed disabled:opacity-45"
                  >
                    {busy ? "Deleting…" : "Permanently delete loop"}
                  </button>
                </div>
              </div>
            </div>
          )}
        </>
      )}
    </AppFrame>
  );
}
