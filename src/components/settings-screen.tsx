"use client";

import { useEffect, useMemo, useState } from "react";
import { AppFrame, EmptyState } from "./app-frame";
import {
  RestaurantDatabaseBrowser,
  type RestaurantWithContributor,
} from "./restaurant-database-browser";
import { LoopAreaPicker, type LoopHomeArea } from "./loop-area-picker";
import type { Restaurant } from "@/lib/types";
import { createClient } from "@/lib/supabase/client";
import {
  getGroupContextWithLoops,
  type GroupContext,
  type GroupMemberRecord,
  type LunchLoopSummary,
} from "@/lib/supabase/group";

type DirectoryMember = GroupMemberRecord & {
  joined_at: string;
  account_email: string | null;
  auth_provider: string | null;
  avatar_url: string | null;
};

type DiscordSettings = {
  enabled: boolean;
  webhook_configured: boolean;
  enabled_events: string[];
};
type Invitation = {
  id: string;
  recipient_email: string;
  status: "pending" | "accepted" | "revoked" | "expired";
  expires_at: string;
  created_at: string;
  accepted_at?: string | null;
};
type ShareableInvitation = {
  id: string;
  invite_label: string | null;
  status: "pending" | "accepted" | "revoked" | "expired";
  expires_at: string;
  created_at: string;
  accepted_at?: string | null;
};
type InviteShare = {
  url: string;
  code?: string;
  label?: string;
  emailSent: boolean;
  recipient?: string;
  kind: "member" | "new-loop" | "share-code";
};
type KnownLoopPerson = {
  user_id: string;
  display_name: string;
  google_full_name: string | null;
  account_email: string | null;
  shared_loop_names: string[];
};
const discordEvents = [
  {
    id: "picks_ready",
    label: "Picks are ready",
    description:
      "When the suggester finishes a selection and vetoing can begin.",
  },
  {
    id: "veto_made",
    label: "A veto is made",
    description: "When a crew member removes a place from the current choice.",
  },
  {
    id: "decision_made",
    label: "A meal is decided",
    description: "When the final restaurant wins the loop.",
  },
  {
    id: "schedule_changed",
    label: "The meal time changes",
    description: "When someone updates the planned date or time.",
  },
  {
    id: "next_turn",
    label: "A new loop can begin",
    description: "When the meal is closed and the next picker is up.",
  },
];

type SettingsTab = "crew" | "area" | "places" | "owner";
const settingsTabs: { id: SettingsTab; label: string; emoji: string }[] = [
  { id: "crew", label: "Crew", emoji: "👥" },
  { id: "area", label: "Area & loops", emoji: "🌎" },
  { id: "places", label: "Places", emoji: "🍽️" },
  { id: "owner", label: "Owner", emoji: "👑" },
];

function SettingsTabs({
  active,
  onChange,
  showOwnerTools,
}: {
  active: SettingsTab;
  onChange: (tab: SettingsTab) => void;
  showOwnerTools: boolean;
}) {
  return (
    <nav aria-label="Settings sections" className="mt-5 -mx-1 overflow-x-auto px-1 pb-1">
      <div className="flex w-max gap-1 rounded-[var(--ll-radius-md)] bg-stone-100 p-1">
        {settingsTabs
          .filter((tab) => tab.id !== "owner" || showOwnerTools)
          .map((tab) => (
            <button
              key={tab.id}
              type="button"
              aria-pressed={active === tab.id}
              onClick={() => onChange(tab.id)}
              className={`inline-flex min-h-11 items-center gap-1.5 whitespace-nowrap rounded-[10px] px-3 text-sm font-semibold transition ${active === tab.id ? "bg-surface text-ink shadow-[var(--ll-shadow-card)]" : "text-stone-600 hover:text-ink"}`}
            >
              <span aria-hidden="true">{tab.emoji}</span>
              {tab.label}
            </button>
          ))}
      </div>
    </nav>
  );
}

export function SettingsScreen() {
  const [settingsTab, setSettingsTabState] = useState<SettingsTab>("crew");
  useEffect(() => {
    const fromHash = window.location.hash.replace("#", "") as SettingsTab;
    if (settingsTabs.some((tab) => tab.id === fromHash)) setSettingsTabState(fromHash);
  }, []);
  function setSettingsTab(tab: SettingsTab) {
    setSettingsTabState(tab);
    window.history.replaceState(null, "", `#${tab}`);
  }
  const [context, setContext] = useState<GroupContext | null>(null);
  const [members, setMembers] = useState<DirectoryMember[]>([]);
  const [restaurants, setRestaurants] = useState<RestaurantWithContributor[]>([]);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const [discord, setDiscord] = useState<DiscordSettings>({
    enabled: true,
    webhook_configured: false,
    enabled_events: discordEvents.map((event) => event.id),
  });
  const [discordWebhook, setDiscordWebhook] = useState("");
  const [loops, setLoops] = useState<LunchLoopSummary[]>([]);
  const [memberInvitations, setMemberInvitations] = useState<Invitation[]>([]);
  const [shareableInvitations, setShareableInvitations] = useState<ShareableInvitation[]>([]);
  const [creationInvitations, setCreationInvitations] = useState<Invitation[]>([]);
  const [memberInviteEmail, setMemberInviteEmail] = useState("");
  const [shareableInviteLabel, setShareableInviteLabel] = useState("");
  const [knownPeople, setKnownPeople] = useState<KnownLoopPerson[]>([]);
  const [knownPeopleSearch, setKnownPeopleSearch] = useState("");
  const [newLoopInviteEmail, setNewLoopInviteEmail] = useState("");
  const [inviteShare, setInviteShare] = useState<InviteShare | null>(null);
  const [homeArea, setHomeArea] = useState<LoopHomeArea>({ label: "", lat: null, lng: null, radiusMiles: 25, timeZone: "America/Chicago" });

  async function load() {
    setLoading(true);
    setError("");
    try {
      const { context: group, loops: loopsResult } = await getGroupContextWithLoops();
      const supabase = createClient();
      const memberInvitationsResult = group.role === "owner"
        ? supabase.rpc("get_group_member_invitations", { target_group: group.groupId })
        : Promise.resolve({ data: [], error: null });
      const shareableInvitationsResult = group.role === "owner"
        ? supabase.rpc("get_group_member_share_invitations", { target_group: group.groupId })
        : Promise.resolve({ data: [], error: null });
      const discordResult = group.role === "owner"
        ? supabase.rpc("get_group_discord_notification_settings", { target_group: group.groupId })
        : Promise.resolve({ data: [], error: null });
      const knownPeopleResult = group.role === "owner"
        ? supabase.rpc("get_known_lunch_loop_people", { target_group: group.groupId })
        : Promise.resolve({ data: [], error: null });
      const [directoryResult, restaurantResult, creationInvitesResult, inviteResult, shareInviteResult, discordSettingsResult, knownPeopleRequest] =
        await Promise.all([
          supabase.rpc("get_group_member_directory", {
            target_group: group.groupId,
          }),
          supabase
            .from("restaurants")
            .select("*, profiles!restaurants_added_by_fkey(display_name)")
            .eq("group_id", group.groupId)
            .order("name"),
          supabase.rpc("get_group_creation_invitations", {
            target_group: group.groupId,
          }),
          memberInvitationsResult,
          shareableInvitationsResult,
          discordResult,
          knownPeopleResult,
        ]);
      if (directoryResult.error) throw directoryResult.error;
      if (restaurantResult.error) throw restaurantResult.error;
      if (creationInvitesResult.error) throw creationInvitesResult.error;
      if (inviteResult.error) throw inviteResult.error;
      if (shareInviteResult.error) throw shareInviteResult.error;
      if (discordSettingsResult.error) throw discordSettingsResult.error;
      if (knownPeopleRequest.error) throw knownPeopleRequest.error;
      if (group.role === "owner") {
        setMemberInvitations((inviteResult.data ?? []) as Invitation[]);
        setShareableInvitations((shareInviteResult.data ?? []) as ShareableInvitation[]);
        const config = (discordSettingsResult.data?.[0] ?? null) as DiscordSettings | null;
        if (config) setDiscord(config);
        setKnownPeople((knownPeopleRequest.data ?? []) as KnownLoopPerson[]);
      }
      setContext(group);
      setMembers((directoryResult.data ?? []) as DirectoryMember[]);
      setRestaurants(
        (restaurantResult.data ?? []) as unknown as RestaurantWithContributor[],
      );
      setLoops(loopsResult);
      const currentLoop = loopsResult.find((loop) => loop.group_id === group.groupId);
      if (currentLoop) {
        setHomeArea({
          label: currentLoop.home_label ?? "",
          lat: currentLoop.home_lat,
          lng: currentLoop.home_lng,
          radiusMiles: currentLoop.search_radius_miles ?? 25,
          timeZone: currentLoop.time_zone ?? "America/Chicago",
        });
      }
      setCreationInvitations((creationInvitesResult.data ?? []) as Invitation[]);
    } catch (loadError) {
      setError(
        loadError instanceof Error
          ? loadError.message
          : "Settings could not be loaded.",
      );
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
  }, []);

  async function copyInviteCode() {
    if (!inviteShare) return;
    const text =
      inviteShare.kind === "member"
        ? `Join my Lunch Loop: ${inviteShare.url}\n\nOr sign in at https://lunchloop.app/join and enter this one-time code: ${inviteShare.code}`
        : inviteShare.kind === "share-code"
          ? `Join my Lunch Loop: ${inviteShare.url}\n\nOne-time code: ${inviteShare.code}\n\nThis link and code work once, so please do not forward them.`
        : `Start your own Lunch Loop: ${inviteShare.url}`;
    try {
      await navigator.clipboard.writeText(text);
      setMessage("Invite message copied—paste it wherever you like.");
    } catch {
      setMessage(text);
    }
  }

  async function saveHomeArea() {
    if (!context) return;
    setSaving(true);
    setError("");
    setMessage("");
    try {
      if (!homeArea.label || homeArea.lat === null || homeArea.lng === null) {
        throw new Error("Choose an autocomplete result for your Lunch Loop’s home area.");
      }
      const { error: areaError } = await createClient().rpc("save_lunch_loop_home_area", {
        target_group: context.groupId,
        new_home_label: homeArea.label,
        new_home_lat: homeArea.lat,
        new_home_lng: homeArea.lng,
        new_search_radius_miles: homeArea.radiusMiles,
        new_time_zone: homeArea.timeZone,
      });
      if (areaError) throw areaError;
      setMessage("Lunch Loop home area saved. New place searches will use it right away.");
      await load();
    } catch (areaError) {
      setError(areaError instanceof Error ? areaError.message : "The Lunch Loop home area could not be saved.");
    } finally {
      setSaving(false);
    }
  }

  async function sendMemberInvite(event: React.FormEvent) {
    event.preventDefault();
    if (!context) return;
    setSaving(true);
    setError("");
    setMessage("");
    try {
      const response = await fetch("/api/invitations/member", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ groupId: context.groupId, email: memberInviteEmail }),
      });
      const result = (await response.json()) as {
        inviteUrl?: string;
        shortCode?: string;
        emailSent?: boolean;
        error?: string;
      };
      if (!response.ok || !result.inviteUrl || !result.shortCode) {
        throw new Error(result.error ?? "The invitation could not be created.");
      }
      setInviteShare({
        url: result.inviteUrl,
        code: result.shortCode,
        emailSent: Boolean(result.emailSent),
        recipient: memberInviteEmail,
        kind: "member",
      });
      setMemberInviteEmail("");
      setMessage(
        result.emailSent
          ? "Invitation email sent. A one-time text-friendly version is ready to copy too."
          : "One-time invitation created. Copy it below to text or share until email delivery is configured.",
      );
      await load();
    } catch (inviteError) {
      setError(inviteError instanceof Error ? inviteError.message : "The invitation could not be created.");
    } finally {
      setSaving(false);
    }
  }

  async function createShareableInvite() {
    if (!context) return;
    setSaving(true);
    setError("");
    setMessage("");
    try {
      const response = await fetch("/api/invitations/share-code", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ groupId: context.groupId, label: shareableInviteLabel.trim() || undefined }),
      });
      const result = (await response.json()) as {
        inviteUrl?: string;
        shortCode?: string;
        error?: string;
      };
      if (!response.ok || !result.inviteUrl || !result.shortCode) {
        throw new Error(result.error ?? "The shareable invitation could not be created.");
      }
      setInviteShare({
        url: result.inviteUrl,
        code: result.shortCode,
        label: shareableInviteLabel.trim() || undefined,
        emailSent: false,
        kind: "share-code",
      });
      setShareableInviteLabel("");
      setMessage("One-time code and link created. Copy either one to text your friend.");
      await load();
    } catch (inviteError) {
      setError(inviteError instanceof Error ? inviteError.message : "The shareable invitation could not be created.");
    } finally {
      setSaving(false);
    }
  }

  async function addKnownPerson(person: KnownLoopPerson) {
    if (!context) return;
    setSaving(true);
    setError("");
    setMessage("");
    try {
      const response = await fetch("/api/loops/add-known-member", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ groupId: context.groupId, userId: person.user_id }),
      });
      const result = (await response.json()) as {
        displayName?: string;
        groupName?: string;
        emailSent?: boolean;
        error?: string;
      };
      if (!response.ok || !result.groupName) {
        throw new Error(result.error ?? "That Lunch Loop member could not be added.");
      }
      setMessage(result.emailSent
        ? `${result.displayName ?? person.display_name} is now in ${result.groupName}. We sent them an email too.`
        : `${result.displayName ?? person.display_name} is now in ${result.groupName}. They will see a Lunch Loop message next time they sign in.`);
      await load();
    } catch (addError) {
      setError(addError instanceof Error ? addError.message : "That Lunch Loop member could not be added.");
    } finally {
      setSaving(false);
    }
  }

  async function sendNewLoopInvite(event: React.FormEvent) {
    event.preventDefault();
    if (!context) return;
    setSaving(true);
    setError("");
    setMessage("");
    try {
      const response = await fetch("/api/invitations/new-loop", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ groupId: context.groupId, email: newLoopInviteEmail }),
      });
      const result = (await response.json()) as {
        inviteUrl?: string;
        emailSent?: boolean;
        error?: string;
      };
      if (!response.ok || !result.inviteUrl) {
        throw new Error(result.error ?? "The new-loop invitation could not be created.");
      }
      setInviteShare({
        url: result.inviteUrl,
        emailSent: Boolean(result.emailSent),
        recipient: newLoopInviteEmail,
        kind: "new-loop",
      });
      setNewLoopInviteEmail("");
      setMessage(
        result.emailSent
          ? "New Lunch Loop invitation email sent."
          : "New Lunch Loop invitation created. Copy its link below until email delivery is configured.",
      );
      await load();
    } catch (inviteError) {
      setError(inviteError instanceof Error ? inviteError.message : "The new-loop invitation could not be created.");
    } finally {
      setSaving(false);
    }
  }

  async function revokeMemberInvite(invite: Invitation) {
    setSaving(true);
    setError("");
    try {
      const { error: revokeError } = await createClient().rpc(
        "revoke_group_member_invitation",
        { target_invitation: invite.id },
      );
      if (revokeError) throw revokeError;
      setMessage("Invitation revoked.");
      await load();
    } catch (revokeError) {
      setError(revokeError instanceof Error ? revokeError.message : "Invitation could not be revoked.");
    } finally {
      setSaving(false);
    }
  }

  async function revokeShareableInvite(invite: ShareableInvitation) {
    setSaving(true);
    setError("");
    try {
      const { error: revokeError } = await createClient().rpc(
        "revoke_group_member_share_invitation",
        { target_invitation: invite.id },
      );
      if (revokeError) throw revokeError;
      if (inviteShare?.kind === "share-code") setInviteShare(null);
      setMessage("Shareable invitation revoked.");
      await load();
    } catch (revokeError) {
      setError(revokeError instanceof Error ? revokeError.message : "Shareable invitation could not be revoked.");
    } finally {
      setSaving(false);
    }
  }

  async function switchLoop(loop: LunchLoopSummary) {
    if (loop.status !== "active") return;
    setSaving(true);
    try {
      const { error: switchError } = await createClient().rpc(
        "set_active_lunch_loop",
        { target_group: loop.group_id },
      );
      if (switchError) throw switchError;
      window.location.assign("/");
    } catch (switchError) {
      setError(switchError instanceof Error ? switchError.message : "Lunch Loop could not be switched.");
      setSaving(false);
    }
  }

  async function exportLoop() {
    if (!context) return;
    setSaving(true);
    setError("");
    try {
      const { data, error: exportError } = await createClient().rpc(
        "export_lunch_loop_data",
        { target_group: context.groupId },
      );
      if (exportError) throw exportError;
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = `${context.groupName.toLowerCase().replace(/[^a-z0-9]+/g, "-")}-lunch-loop-export.json`;
      anchor.click();
      URL.revokeObjectURL(url);
      setMessage("Your Lunch Loop export downloaded.");
    } catch (exportError) {
      setError(exportError instanceof Error ? exportError.message : "Export could not be created.");
    } finally {
      setSaving(false);
    }
  }

  async function transferOwnership(newOwner: string) {
    if (!context || !newOwner || !window.confirm("Transfer ownership? You will stay in the crew as a member.")) return;
    setSaving(true);
    try {
      const { error: transferError } = await createClient().rpc("transfer_lunch_loop_ownership", { target_group: context.groupId, new_owner: newOwner });
      if (transferError) throw transferError;
      setMessage("Ownership transferred. Your role is now a crew member.");
      await load();
    } catch (transferError) {
      setError(transferError instanceof Error ? transferError.message : "Ownership could not be transferred.");
    } finally { setSaving(false); }
  }

  async function archiveLoop() {
    if (!context || !window.confirm(`Archive ${context.groupName}? It will be recoverable for 30 days, then you may permanently delete it.`)) return;
    setSaving(true);
    try {
      const { data, error: archiveError } = await createClient().rpc("archive_lunch_loop", { target_group: context.groupId });
      if (archiveError) throw archiveError;
      setMessage(`Lunch Loop archived. It can be recovered until ${new Date(data).toLocaleDateString("en-US", { weekday: "long", month: "short", day: "numeric", year: "numeric" })}.`);
      await load();
      window.setTimeout(() => window.location.assign("/"), 900);
    } catch (archiveError) {
      setError(archiveError instanceof Error ? archiveError.message : "Lunch Loop could not be archived.");
      setSaving(false);
    }
  }

  function updateName(index: number, display_name: string) {
    setMembers((current) =>
      current.map((member, memberIndex) =>
        memberIndex === index ? { ...member, display_name } : member,
      ),
    );
  }
  function moveMember(index: number, direction: -1 | 1) {
    setMembers((current) => {
      const destination = index + direction;
      if (destination < 0 || destination >= current.length) return current;
      const next = [...current];
      [next[index], next[destination]] = [next[destination], next[index]];
      return next.map((member, rotation_order) => ({
        ...member,
        rotation_order,
      }));
    });
  }
  function removeMember(index: number) {
    if (!context || members[index]?.user_id === context.userId) return;
    setMembers((current) =>
      current
        .filter((_, memberIndex) => memberIndex !== index)
        .map((member, rotation_order) => ({ ...member, rotation_order })),
    );
  }
  async function saveRoster() {
    if (!context) return;
    setSaving(true);
    setError("");
    setMessage("");
    try {
      const { error: saveError } = await createClient().rpc(
        "save_lunch_group_roster",
        {
          target_group: context.groupId,
          member_ids: members.map((member) => member.user_id),
          display_names: members.map((member) => member.display_name),
        },
      );
      if (saveError) throw saveError;
      setMessage(context.loopType === "occasion" ? "Occasion crew saved." : "Roster and rotation saved.");
      await load();
    } catch (saveError) {
      setError(
        saveError instanceof Error
          ? saveError.message
          : "Roster could not be saved.",
      );
    } finally {
      setSaving(false);
    }
  }
  async function toggleNeverAgain(restaurant: Restaurant) {
    if (!context) return;
    setError("");
    const { error: updateError } = await createClient()
      .from("restaurants")
      .update({ never_again: !restaurant.never_again })
      .eq("id", restaurant.id)
      .eq("group_id", context.groupId);
    if (updateError) {
      setError(updateError.message);
      return;
    }
    setRestaurants((current) =>
      current.map((item) =>
        item.id === restaurant.id
          ? { ...item, never_again: !item.never_again }
          : item,
      ),
    );
  }
  async function deleteRestaurant(restaurant: Restaurant) {
    if (
      !context ||
      !window.confirm(`Remove ${restaurant.name} from the shared list?`)
    )
      return;
    setError("");
    const { error: deleteError } = await createClient()
      .from("restaurants")
      .delete()
      .eq("id", restaurant.id)
      .eq("group_id", context.groupId);
    if (deleteError) {
      setError(deleteError.message);
      return;
    }
    setRestaurants((current) =>
      current.filter((item) => item.id !== restaurant.id),
    );
    setMessage(`${restaurant.name} was removed.`);
  }
  function toggleDiscordEvent(eventId: string) {
    setDiscord((current) => ({
      ...current,
      enabled_events: current.enabled_events.includes(eventId)
        ? current.enabled_events.filter((item) => item !== eventId)
        : [...current.enabled_events, eventId],
    }));
  }
  async function saveDiscordSettings() {
    if (!context) return;
    setSaving(true);
    setError("");
    setMessage("");
    try {
      const { error: saveError } = await createClient().rpc(
        "save_group_discord_notification_settings",
        {
          target_group: context.groupId,
          new_webhook_url: discordWebhook,
          new_enabled: discord.enabled,
          new_enabled_events: discord.enabled_events,
        },
      );
      if (saveError) throw saveError;
      setDiscordWebhook("");
      setMessage("Discord notification settings saved.");
      await load();
    } catch (saveError) {
      setError(
        saveError instanceof Error
          ? saveError.message
          : "Discord settings could not be saved.",
      );
    } finally {
      setSaving(false);
    }
  }
  async function testDiscord() {
    if (!context) return;
    setSaving(true);
    setError("");
    setMessage("");
    try {
      const { error: testError } = await createClient().rpc(
        "send_test_group_discord_notification",
        { target_group: context.groupId },
      );
      if (testError) throw testError;
      setMessage(
        "Test message queued for Discord. It should arrive in a few seconds.",
      );
    } catch (testError) {
      setError(
        testError instanceof Error
          ? testError.message
          : "Discord test message could not be sent.",
      );
    } finally {
      setSaving(false);
    }
  }
  async function disconnectDiscord() {
    if (
      !context ||
      !window.confirm(
        "Disconnect Discord for this lunch loop? Notifications will stop immediately.",
      )
    )
      return;
    setSaving(true);
    setError("");
    setMessage("");
    try {
      const { error: removeError } = await createClient().rpc(
        "remove_group_discord_notification_settings",
        { target_group: context.groupId },
      );
      if (removeError) throw removeError;
      setDiscord({
        enabled: true,
        webhook_configured: false,
        enabled_events: discordEvents.map((event) => event.id),
      });
      setDiscordWebhook("");
      setMessage("Discord notifications disconnected.");
    } catch (removeError) {
      setError(
        removeError instanceof Error
          ? removeError.message
          : "Discord could not be disconnected.",
      );
    } finally {
      setSaving(false);
    }
  }

  const visibleKnownPeople = useMemo(() => {
    const term = knownPeopleSearch.trim().toLowerCase();
    return term
      ? knownPeople.filter((person) => `${person.display_name} ${person.google_full_name ?? ""} ${person.account_email ?? ""} ${person.shared_loop_names.join(" ")}`.toLowerCase().includes(term))
      : knownPeople;
  }, [knownPeople, knownPeopleSearch]);
  const hasActivePendingInvite = (invite: { status: string; expires_at: string }) =>
    invite.status === "pending" && new Date(invite.expires_at).getTime() > Date.now();
  const pendingInvitationCount =
    memberInvitations.filter(hasActivePendingInvite).length +
    shareableInvitations.filter(hasActivePendingInvite).length;
  const availableInvitationCount = Math.max(
    0,
    6 - members.length - pendingInvitationCount,
  );

  return (
    <AppFrame>
      <p className="text-sm font-medium text-accent-strong">
        Loop settings
      </p>
      <div className="mt-1 flex items-center gap-3">
        <h1 className="text-[28px] font-bold leading-tight tracking-tight md:text-[36px]">Settings</h1>
        {context?.role === "owner" && <span className="rounded-full bg-accent-soft px-2.5 py-1 text-xs font-semibold text-accent-strong">👑 Owner</span>}
      </div>
      <p className="mt-2 text-[15px] text-muted">
        Your crew, search area, and places.{" "}{/* owner-only tools sit in the Owner section */}
      </p>
      {loading ? (
        <p className="mt-6 text-sm font-semibold text-stone-500">
          Loading group settings…
        </p>
      ) : error && !context ? (
        <EmptyState emoji="⚙️" title="Settings need a lunch group">
          {error}
        </EmptyState>
      ) : (
        context && (
          <>
            <SettingsTabs active={settingsTab} onChange={setSettingsTab} showOwnerTools={context.role === "owner"} />
            {settingsTab === "crew" && <>
            <section className="mt-6 rounded-[var(--ll-radius-lg)] bg-surface p-5 shadow-[var(--ll-shadow-card)]">
              <div className="flex items-end justify-between gap-3">
                <div>
                  <h2 className="text-[17px] font-semibold">{context.loopType === "occasion" ? "Occasion crew" : "Crew and pick order"}</h2>
                  <p className="mt-1 text-sm leading-6 text-muted">
                    {context.loopType === "occasion"
                      ? `The owner makes the first occasion’s picks. After that, whoever starts an occasion makes that night’s picks. Each Lunch Loop supports up to six people (${members.length}/6).`
                      : `This order decides whose turn it is to pick. Up to six people (${members.length}/6).`}
                  </p>
                </div>
                {context.role === "owner" && (
                  <span className="shrink-0 text-sm font-medium text-accent-strong">
                    Owner controls
                  </span>
                )}
              </div>
              <p className="mt-3 text-sm leading-6 text-subtle">
                Names here are for this Lunch Loop only. The account under each
                name identifies the real member; only the owner sees everyone’s.
              </p>
              <ul className="mt-4 divide-y divide-line overflow-hidden rounded-[var(--ll-radius-md)] border border-line">
                {members.map((member, index) => (
                  <li key={member.user_id} className="px-4 py-3">
                    <div className="flex items-center gap-3">
                      <span className="grid size-8 shrink-0 place-items-center rounded-full bg-accent-soft text-sm font-semibold text-accent-ink">
                        {index + 1}
                      </span>
                      {context.role === "owner" ? (
                        <input
                          value={member.display_name}
                          onChange={(event) => updateName(index, event.target.value)}
                          className="min-h-11 w-full min-w-0 flex-1 rounded-[var(--ll-radius-md)] border border-line bg-surface px-3 text-base"
                          aria-label={`Lunch Loop name for member ${index + 1}`}
                        />
                      ) : (
                        <p className="min-w-0 flex-1 truncate text-[15px] font-semibold">{member.display_name}</p>
                      )}
                    </div>
                    <p className="mt-1.5 pl-11 text-sm leading-6 text-subtle [overflow-wrap:anywhere]">
                      {member.account_email
                        ? `${member.auth_provider === "google" ? "Google" : "Account"}: ${member.account_email}`
                        : member.user_id === context.userId
                          ? "Your account details are not available yet. Sign out and back in to refresh them."
                          : "Account details are visible to the owner only."}
                      {member.joined_at
                        ? ` · Joined ${new Date(member.joined_at).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}`
                        : ""}
                    </p>
                    {(member.role === "owner" || context.role === "owner") && (
                      <div className="mt-1 flex items-center gap-1 pl-11">
                        {member.role === "owner" && (
                          <span className="mr-auto rounded-full bg-accent-soft px-2.5 py-0.5 text-sm font-medium text-accent-ink">Owner</span>
                        )}
                        {context.role === "owner" && (
                          <div className="ml-auto flex items-center gap-1">
                            {context.loopType === "standing" && <>
                              <button
                                onClick={() => moveMember(index, -1)}
                                disabled={index === 0}
                                className="grid size-10 place-items-center rounded-[var(--ll-radius-md)] text-[15px] text-muted hover:bg-surface-muted disabled:opacity-30"
                                aria-label={`Move ${member.display_name} earlier`}
                              >
                                ↑
                              </button>
                              <button
                                onClick={() => moveMember(index, 1)}
                                disabled={index === members.length - 1}
                                className="grid size-10 place-items-center rounded-[var(--ll-radius-md)] text-[15px] text-muted hover:bg-surface-muted disabled:opacity-30"
                                aria-label={`Move ${member.display_name} later`}
                              >
                                ↓
                              </button>
                            </>}
                            {member.user_id !== context.userId && (
                              <button
                                onClick={() => removeMember(index)}
                                className="min-h-10 rounded-[var(--ll-radius-md)] px-3 text-sm font-medium text-rose-700 hover:bg-rose-50"
                              >
                                Remove
                              </button>
                            )}
                          </div>
                        )}
                      </div>
                    )}
                  </li>
                ))}
              </ul>
              {context.role === "owner" && (
                <button
                  disabled={saving}
                  onClick={saveRoster}
                  className="mt-4 min-h-11 rounded-[var(--ll-radius-md)] bg-accent-strong px-4 text-[15px] font-semibold text-on-accent disabled:opacity-60"
                >
                  {saving ? "Saving…" : "Save roster"}
                </button>
              )}
            </section>
            <section className="ll-calm mt-4 overflow-hidden rounded-[var(--ll-radius-lg)] p-5">
              <div className="flex items-start gap-3">
                <span className="grid size-11 shrink-0 place-items-center rounded-2xl bg-white/20 text-2xl" aria-hidden="true">👋</span>
                <div>
                  <p className="text-xs font-bold text-orange-100">{context.groupName}</p>
                  <h2 className="mt-1 text-xl font-black">Invite people</h2>
                </div>
              </div>
              <p className="mt-3 max-w-3xl text-sm leading-6 text-orange-50">Invite by email, or make a short code to text. Each invite works once and expires after 14 days.</p>
              {context.role === "owner" ? <>
                {knownPeople.length > 0 && <div className="mt-5 rounded-2xl bg-white/95 p-4 text-stone-900 shadow-sm">
                  <p className="text-sm font-black">Bring in someone from another Lunch Loop</p>
                  <p className="mt-1 text-xs leading-5 text-stone-600">People you already share a Lunch Loop with. Adding one makes them a member right away and emails them. Finish any round underway first.</p>
                  <input value={knownPeopleSearch} onChange={(event) => setKnownPeopleSearch(event.target.value)} placeholder="Search name, email, or current Lunch Loop" className="mt-3 w-full rounded-xl border border-orange-200 bg-white px-3 py-3 text-sm outline-none focus:ring-2 focus:ring-orange-300" />
                  <div className="mt-3 max-h-64 space-y-2 overflow-y-auto pr-1">
                    {visibleKnownPeople.map((person) => <div key={person.user_id} className="flex flex-wrap items-center justify-between gap-3 rounded-xl bg-orange-50 px-3 py-3"><div className="min-w-0"><p className="font-black">{person.display_name}</p>{person.google_full_name && person.google_full_name !== person.display_name && <p className="text-xs text-orange-800">Google name: {person.google_full_name}</p>}<p className="truncate text-xs text-stone-600">{person.account_email ?? "Email unavailable"}</p><p className="mt-1 text-xs font-semibold text-stone-500">Also in {person.shared_loop_names.join(", ")}</p></div><button type="button" disabled={saving || availableInvitationCount === 0} onClick={() => void addKnownPerson(person)} className="shrink-0 rounded-xl bg-orange-500 px-3 py-2 text-sm font-black text-white disabled:opacity-60">{availableInvitationCount === 0 ? "No open spots" : "Add to this loop"}</button></div>)}
                    {!visibleKnownPeople.length && <p className="rounded-xl bg-stone-50 p-3 text-sm text-stone-500">No matching people from your other active Lunch Loops.</p>}
                  </div>
                </div>}
                <form onSubmit={sendMemberInvite} className="mt-4 rounded-2xl bg-white/95 p-4 text-stone-900 shadow-sm">
                  <label className="block text-sm font-black">Invite someone new to {context.groupName}
                    <span className="mt-1 block text-xs font-normal text-stone-600">{members.length}/6 spots filled · {pendingInvitationCount} held by invitations. If a round is underway, they join after it closes.</span>
                    <input required type="email" value={memberInviteEmail} onChange={(event) => setMemberInviteEmail(event.target.value)} placeholder="friend@example.com" className="mt-3 w-full rounded-xl bg-white px-3 py-3 text-sm font-normal text-stone-900 outline-none focus:ring-2 focus:ring-orange-300" />
                  </label>
                  <button disabled={saving || availableInvitationCount === 0} className="mt-3 rounded-xl bg-orange-500 px-4 py-3 text-sm font-black text-white disabled:opacity-60">{availableInvitationCount === 0 ? "No open crew spots" : saving ? "Creating invite…" : "Send one-time invite"}</button>
                </form>
                <div className="mt-4 rounded-2xl border border-orange-200 bg-orange-50 p-4 text-stone-900 shadow-sm">
                  <p className="text-sm font-black">No email handy?</p>
                  <p className="mt-1 text-xs leading-5 text-stone-600">Make a one-time code and link to text. The first person to use it joins.</p>
                  <label className="mt-3 block text-xs font-bold text-stone-700">Who is this for? <span className="font-normal text-stone-500">Optional—only the owner sees this note.</span>
                    <input value={shareableInviteLabel} onChange={(event) => setShareableInviteLabel(event.target.value)} maxLength={80} placeholder="e.g. Jamie" className="mt-2 w-full rounded-xl border border-orange-200 bg-white px-3 py-3 text-sm font-normal text-stone-900 outline-none focus:ring-2 focus:ring-orange-300" />
                  </label>
                  <div className="mt-3 flex flex-wrap items-center justify-between gap-3"><p className="text-xs font-bold text-orange-800">{availableInvitationCount > 0 ? `${availableInvitationCount} invitation ${availableInvitationCount === 1 ? "spot" : "spots"} still available` : "No open invitation spots right now"}</p><button type="button" disabled={saving || availableInvitationCount === 0} onClick={() => void createShareableInvite()} className="rounded-xl bg-orange-500 px-4 py-3 text-sm font-black text-white disabled:opacity-60">{saving ? "Creating code…" : "Generate code and link"}</button></div>
                </div>
              </> : <p className="mt-4 rounded-2xl bg-white/15 p-4 text-sm text-white">Only the owner can add someone to this Lunch Loop. You can still refer a friend to start their own crew below.</p>}
              <form onSubmit={sendNewLoopInvite} className="mt-4 rounded-2xl border border-white/30 bg-white/10 p-4">
                <label className="block text-sm font-black">Know someone who needs their own Lunch Loop?
                  <span className="mt-1 block text-xs font-normal text-orange-50">They become the owner of a completely separate crew, database, and history.</span>
                  <input required type="email" value={newLoopInviteEmail} onChange={(event) => setNewLoopInviteEmail(event.target.value)} placeholder="friend@example.com" className="mt-3 w-full rounded-xl bg-white px-3 py-3 text-sm font-normal text-stone-900 outline-none focus:ring-2 focus:ring-orange-300" />
                </label>
                <button disabled={saving} className="mt-3 rounded-xl bg-white px-4 py-3 text-sm font-black text-orange-800 shadow-sm disabled:opacity-60">{saving ? "Creating invite…" : "Invite them to start a loop"}</button>
              </form>
              {inviteShare && (
                <div className="mt-4 rounded-2xl bg-emerald-50 p-4 text-stone-900">
                  <p className="font-black">{inviteShare.kind === "share-code" ? `Shareable invite${inviteShare.label ? ` for ${inviteShare.label}` : ""} is ready` : inviteShare.emailSent ? `Sent to ${inviteShare.recipient}` : `Ready to share with ${inviteShare.recipient}`}</p>
                  <p className="mt-1 text-sm text-stone-600">{inviteShare.kind === "share-code" ? "Text this link or short code to one person. Whoever signs in and redeems it first joins the crew." : inviteShare.kind === "member" ? "Email delivery is optional—copy the secure link and one-time code to text it instead." : "Copy this secure link if you’d rather text it yourself."}</p>
                  <p className="mt-3 break-all rounded-xl bg-white px-3 py-2 text-xs font-bold">{inviteShare.url}</p>
                  {inviteShare.code && <p className="mt-2 text-sm font-black">One-time code: <code className="tracking-widest">{inviteShare.code}</code></p>}
                  <button type="button" onClick={copyInviteCode} className="mt-3 rounded-xl bg-orange-700 px-3 py-2 text-sm font-black text-white">Copy invite message</button>
                </div>
              )}
              {context.role === "owner" && (memberInvitations.length > 0 || shareableInvitations.length > 0) && <div className="mt-5 border-t border-white/25 pt-4"><h3 className="font-black">Crew invitations</h3><div className="mt-3 space-y-2">{shareableInvitations.slice(0, 6).map((invite) => <div key={invite.id} className="flex flex-wrap items-center justify-between gap-2 rounded-xl bg-white/15 px-3 py-2 text-sm"><span className="min-w-0 truncate"><strong>{invite.invite_label || "Unnamed friend"}</strong> · shareable code · <span className="font-bold">{invite.status}</span>{invite.status === "pending" ? ` · expires ${new Date(invite.expires_at).toLocaleDateString()}` : ""}</span>{invite.status === "pending" && <button disabled={saving} onClick={() => void revokeShareableInvite(invite)} className="font-bold text-white underline">Revoke</button>}</div>)}{memberInvitations.slice(0, 8).map((invite) => <div key={invite.id} className="flex flex-wrap items-center justify-between gap-2 rounded-xl bg-white/15 px-3 py-2 text-sm"><span className="min-w-0 truncate">{invite.recipient_email} · <span className="font-bold">{invite.status}</span></span>{invite.status === "pending" && <button disabled={saving} onClick={() => void revokeMemberInvite(invite)} className="font-bold text-white underline">Revoke</button>}</div>)}</div></div>}
            </section>
            </>}
            {settingsTab === "area" && <>
            <section className="mt-7 rounded-3xl bg-white p-5 shadow-sm">
              <div className="flex items-start gap-3"><span className="grid size-10 place-items-center rounded-2xl bg-orange-100 text-xl" aria-hidden="true">🌎</span><div><p className="text-xs font-bold text-orange-600">Your search area</p>
              <h2 className="mt-1 text-xl font-black">Where does {context.groupName} eat?</h2></div></div>
              <p className="mt-2 text-sm text-stone-600">Every Lunch Loop has its own home location and search radius. The shared restaurant database stays separate, even when another crew uses Lunch Loop in a different city.</p>
              {context.role === "owner" ? <>
                <div className="mt-4"><LoopAreaPicker value={homeArea} onChange={setHomeArea} disabled={saving} /></div>
                <button type="button" disabled={saving || !homeArea.label || homeArea.lat === null || homeArea.lng === null || !homeArea.timeZone} onClick={() => void saveHomeArea()} className="mt-4 rounded-xl bg-orange-500 px-4 py-3 text-sm font-black text-white disabled:opacity-60">{saving ? "Saving…" : "Save search area and time zone"}</button>
              </> : <div className="mt-4 rounded-2xl bg-orange-50 p-4 text-sm text-stone-700"><strong>{homeArea.label || "Home area not set yet"}</strong>{homeArea.label ? ` · ${homeArea.radiusMiles} mile search radius` : ". Ask the Lunch Loop owner to set it before adding places."}</div>}
            </section>
            {loops.length > 1 && <section className="mt-7 rounded-3xl bg-white p-5 shadow-sm"><div className="flex items-start gap-3"><span className="grid size-10 place-items-center rounded-2xl bg-orange-100 text-xl" aria-hidden="true">🧭</span><div><h2 className="text-lg font-black">Your Lunch Loops</h2><p className="mt-1 text-sm text-stone-500">Each loop keeps its own people, places, and stats. Choose which active loop you’re using now.</p></div></div><div className="mt-4 space-y-2">{loops.map((loop) => <div key={loop.group_id} className="flex flex-wrap items-center justify-between gap-3 rounded-2xl bg-stone-50 p-3"><div><p className="font-black">{loop.group_name} {loop.active && <span className="ml-1 text-xs text-orange-700">Current</span>}</p><p className="text-xs text-stone-500">{loop.role} · {loop.member_count}/6 people · {loop.status}</p></div>{loop.status === "active" && !loop.active && <button disabled={saving} onClick={() => void switchLoop(loop)} className="rounded-xl bg-orange-600 px-3 py-2 text-sm font-black text-white">Switch to this loop</button>}</div>)}</div></section>}
            </>}
            {settingsTab === "places" && <>
            <section className="mt-7">
              <div>
                <h2 className="text-lg font-black">🍽️ Lunch database</h2>
                <p className="mt-1 text-sm text-stone-500">
                  {context.role === "owner"
                    ? "Search, filter, and sort the same database the crew uses. You can also retire a place or remove an accidental entry."
                    : "Search, filter, and sort the shared restaurant database. Only the owner can retire or remove places."}
                </p>
              </div>
              <RestaurantDatabaseBrowser
                restaurants={restaurants}
                timeZone={homeArea.timeZone}
                actions={
                  context.role === "owner"
                    ? (restaurant) => (
                        <div className="flex flex-wrap gap-2">
                          <button
                            type="button"
                            onClick={() => void toggleNeverAgain(restaurant)}
                            className={`rounded-lg px-3 py-2 text-sm font-bold ${restaurant.never_again ? "bg-emerald-50 text-emerald-700" : "bg-amber-50 text-amber-800"}`}
                          >
                            {restaurant.never_again ? "Restore" : "Never again"}
                          </button>
                          <button
                            type="button"
                            onClick={() => void deleteRestaurant(restaurant)}
                            className="rounded-lg bg-rose-50 px-3 py-2 text-sm font-bold text-rose-700"
                          >
                            Remove
                          </button>
                        </div>
                      )
                    : undefined
                }
              />
            </section>
            </>}
            {settingsTab === "owner" && context.role === "owner" && <>
            {context.role === "owner" && (
              <section className="mt-7 rounded-3xl border border-indigo-100 bg-indigo-50/60 p-5 shadow-sm">
                <p className="text-xs font-bold text-indigo-700">
                  Optional integration
                </p>
                <h2 className="mt-1 text-xl font-black">
                  💬 Discord notifications
                </h2>
                <p className="mt-2 text-sm text-stone-600">
                  Send your Lunch Loop moments to one Discord channel. The
                  webhook URL is kept private and is never shown here after you
                  save it.
                </p>
                <div className="mt-5 rounded-2xl bg-white p-4">
                  <h3 className="font-black">Set up a Discord webhook</h3>
                  <ol className="mt-3 list-decimal space-y-2 pl-5 text-sm text-stone-600">
                    <li>
                      In Discord, choose the server and text channel for your
                      Lunch Loop updates.
                    </li>
                    <li>
                      Open{" "}
                      <strong>Server Settings → Integrations → Webhooks</strong>
                      , then choose <strong>New Webhook</strong>.
                    </li>
                    <li>
                      Choose that channel, copy the webhook URL, and paste it
                      below.
                    </li>
                  </ol>
                  <p className="mt-3 text-xs font-semibold text-indigo-800">
                    Only paste a webhook for a server you manage. Anyone with
                    its URL can post to that channel.
                  </p>
                </div>
                <div className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-2xl bg-white p-4">
                  <div>
                    <p className="font-black">Connection status</p>
                    <p className="mt-1 text-sm text-stone-600">
                      {discord.webhook_configured
                        ? discord.enabled
                          ? "Connected and sending selected notifications."
                          : "Connected, but notifications are paused."
                        : "Not connected yet."}
                    </p>
                  </div>
                  {discord.webhook_configured && (
                    <span
                      className={`rounded-full px-3 py-1 text-xs font-bold ${discord.enabled ? "bg-emerald-100 text-emerald-800" : "bg-amber-100 text-amber-900"}`}
                    >
                      {discord.enabled ? "Connected" : "Paused"}
                    </span>
                  )}
                </div>
                <label className="mt-4 block text-sm font-bold">
                  Discord webhook URL
                  <input
                    type="url"
                    value={discordWebhook}
                    onChange={(event) => setDiscordWebhook(event.target.value)}
                    autoComplete="off"
                    placeholder={
                      discord.webhook_configured
                        ? "Leave blank to keep the connected webhook"
                        : "https://discord.com/api/webhooks/..."
                    }
                    className="mt-1 w-full rounded-xl border border-indigo-200 bg-white px-3 py-3 font-normal outline-none focus:ring-2 focus:ring-indigo-300"
                  />
                </label>
                <label className="mt-4 flex items-center gap-3 rounded-2xl bg-white px-4 py-3 text-sm font-bold">
                  <input
                    type="checkbox"
                    checked={discord.enabled}
                    onChange={(event) =>
                      setDiscord((current) => ({
                        ...current,
                        enabled: event.target.checked,
                      }))
                    }
                    className="size-5 accent-indigo-600"
                  />
                  Send Discord notifications
                </label>
                <div className="mt-3 grid gap-2 sm:grid-cols-2">
                  {discordEvents
                    .filter((event) => context.loopType === "standing" || event.id !== "next_turn")
                    .map((event) => (
                    <label
                      key={event.id}
                      className="flex gap-3 rounded-2xl bg-white p-3 text-sm"
                    >
                      <input
                        type="checkbox"
                        checked={discord.enabled_events.includes(event.id)}
                        onChange={() => toggleDiscordEvent(event.id)}
                        className="mt-0.5 size-4 accent-indigo-600"
                      />
                      <span>
                        <strong className="block">{event.label}</strong>
                        <span className="mt-1 block text-xs text-stone-500">
                          {event.description}
                        </span>
                      </span>
                    </label>
                  ))}
                </div>
                <div className="mt-5 flex flex-wrap gap-2">
                  <button
                    type="button"
                    disabled={saving || discord.enabled_events.length === 0}
                    onClick={() => void saveDiscordSettings()}
                    className="rounded-xl bg-indigo-700 px-4 py-3 text-sm font-black text-white disabled:opacity-60"
                  >
                    {saving ? "Saving…" : "Save Discord settings"}
                  </button>
                  <button
                    type="button"
                    disabled={
                      saving || !discord.webhook_configured || !discord.enabled
                    }
                    onClick={() => void testDiscord()}
                    className="rounded-xl bg-white px-4 py-3 text-sm font-black text-indigo-800 ring-1 ring-indigo-200 disabled:opacity-50"
                  >
                    Send test message
                  </button>
                  {discord.webhook_configured && (
                    <button
                      type="button"
                      disabled={saving}
                      onClick={() => void disconnectDiscord()}
                      className="rounded-xl bg-rose-50 px-4 py-3 text-sm font-black text-rose-700 disabled:opacity-50"
                    >
                      Disconnect
                    </button>
                  )}
                </div>
              </section>
            )}
            {context.role === "owner" && (
              <section className="mt-7 rounded-3xl border border-amber-200 bg-amber-50 p-5">
                <p className="text-xs font-bold text-amber-800">Owner safeguards</p>
                <h2 className="mt-1 text-xl font-black">🛟 Your Lunch Loop, under your control</h2>
                <p className="mt-2 text-sm leading-6 text-stone-600">Export a portable copy whenever you want. If this crew ends, archive it first—nothing is permanently removed for 30 days.</p>
                <div className="mt-4 flex flex-wrap gap-2">
                  <button type="button" disabled={saving} onClick={() => void exportLoop()} className="rounded-xl bg-white px-4 py-3 text-sm font-black text-stone-900 ring-1 ring-amber-200 disabled:opacity-60">Download data export</button>
                  {members.length > 1 && <select defaultValue="" onChange={(event) => void transferOwnership(event.target.value)} disabled={saving} className="rounded-xl bg-white px-3 py-3 text-sm font-black text-stone-900 ring-1 ring-amber-200"><option value="">Transfer ownership…</option>{members.filter((member) => member.user_id !== context.userId).map((member) => <option key={member.user_id} value={member.user_id}>{member.display_name}</option>)}</select>}
                  <button type="button" disabled={saving} onClick={() => void archiveLoop()} className="rounded-xl bg-rose-700 px-4 py-3 text-sm font-black text-white disabled:opacity-60">Archive this Lunch Loop</button>
                </div>
                <p className="mt-3 text-xs leading-5 text-amber-900">Archiving pauses access and starts a 30-day recovery window. Permanent deletion is deliberately unavailable until that window ends.</p>
              </section>
            )}
            </>}
          </>
        )
      )}
      {error && context && (
        <p
          role="alert"
          className="mt-4 rounded-xl bg-rose-50 px-4 py-3 text-sm font-semibold text-rose-700"
        >
          {error}
        </p>
      )}
      {message && (
        <p
          role="status"
          className="mt-4 rounded-xl bg-emerald-50 px-4 py-3 text-sm font-semibold text-emerald-700"
        >
          {message}
        </p>
      )}
    </AppFrame>
  );
}
