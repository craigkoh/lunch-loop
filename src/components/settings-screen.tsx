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
  { id: "area", label: "Area", emoji: "🌎" },
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
    <nav aria-label="Settings sections" className="mt-5">
      <div className="flex w-full gap-1 rounded-[var(--ll-radius-md)] bg-surface-muted p-1">
        {settingsTabs
          .filter((tab) => tab.id !== "owner" || showOwnerTools)
          .map((tab) => (
            <button
              key={tab.id}
              type="button"
              aria-pressed={active === tab.id}
              onClick={() => onChange(tab.id)}
              className={`inline-flex min-h-11 min-w-0 flex-1 items-center justify-center whitespace-nowrap rounded-[10px] px-2 text-[15px] font-medium transition ${active === tab.id ? "bg-surface text-ink shadow-[var(--ll-shadow-card)]" : "text-muted hover:text-ink"}`}
            >
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

  const cardClass = "mt-4 rounded-[var(--ll-radius-lg)] bg-surface p-5 text-ink shadow-[var(--ll-shadow-card)] sm:p-6";
  const subCardClass = "mt-4 rounded-[var(--ll-radius-md)] border border-line p-4";
  const h2Class = "text-[17px] font-semibold";
  const h3Class = "text-[15px] font-semibold";
  const helpClass = "mt-1 text-sm leading-6 text-muted";
  const inputClass = "mt-2 min-h-11 w-full rounded-[var(--ll-radius-md)] border border-line bg-surface px-3 text-base font-normal text-ink outline-none focus:ring-2 focus:ring-accent/40";
  const primaryButton = "inline-flex min-h-11 items-center justify-center rounded-[var(--ll-radius-md)] bg-accent-strong px-4 text-[15px] font-semibold text-on-accent disabled:opacity-60";
  const secondaryButton = "inline-flex min-h-11 items-center justify-center rounded-[var(--ll-radius-md)] border border-line bg-surface px-4 text-[15px] font-semibold text-ink hover:bg-surface-muted disabled:opacity-50";
  const dangerButton = "inline-flex min-h-11 items-center justify-center rounded-[var(--ll-radius-md)] px-4 text-[15px] font-semibold text-danger hover:bg-danger-soft disabled:opacity-50";

  return (
    <AppFrame>
      <header>
        <div className="flex items-center gap-3">
          <h1 className="text-[28px] font-bold leading-tight tracking-tight md:text-[36px]">Settings</h1>
          {context?.role === "owner" && <span className="rounded-full bg-accent-soft px-2.5 py-1 text-sm font-medium text-accent-ink">Owner</span>}
        </div>
        <p className="mt-2 text-[15px] text-muted">Your crew, search area, and places.</p>
      </header>
      {loading ? (
        <p className="mt-6 text-[15px] text-muted">Loading settings…</p>
      ) : error && !context ? (
        <EmptyState emoji="⚙️" title="Settings need a lunch group">
          {error}
        </EmptyState>
      ) : (
        context && (
          <>
            <SettingsTabs active={settingsTab} onChange={setSettingsTab} showOwnerTools={context.role === "owner"} />
            {settingsTab === "crew" && <>
            <section className={cardClass}>
              <div className="flex items-end justify-between gap-3">
                <div>
                  <h2 className={h2Class}>{context.loopType === "occasion" ? "Occasion crew" : "Crew and pick order"}</h2>
                  <p className={helpClass}>
                    {context.loopType === "occasion"
                      ? `The owner makes the first occasion’s picks. After that, whoever starts an occasion makes that night’s picks. Up to six people (${members.length}/6).`
                      : `This order decides whose turn it is to pick. Up to six people (${members.length}/6).`}
                  </p>
                </div>
              </div>
              <p className="mt-2 text-sm leading-6 text-subtle">
                Names here are for this Lunch Loop only. Only the owner sees everyone’s account.
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
                                className="min-h-10 rounded-[var(--ll-radius-md)] px-3 text-sm font-medium text-danger hover:bg-danger-soft"
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
                <button disabled={saving} onClick={saveRoster} className={`mt-4 ${primaryButton}`}>
                  {saving ? "Saving…" : "Save roster"}
                </button>
              )}
            </section>

            <section className={cardClass}>
              <h2 className={h2Class}>Invite people</h2>
              <p className={helpClass}>Invite by email, or make a short code to text. Each invite works once and expires after 14 days.</p>
              {context.role === "owner" ? <>
                <p className="mt-3 text-sm font-medium text-accent-ink">
                  {members.length}/6 spots filled · {pendingInvitationCount} held by invitations · {availableInvitationCount > 0 ? `${availableInvitationCount} open` : "none open"}
                </p>
                {knownPeople.length > 0 && <div className={subCardClass}>
                  <h3 className={h3Class}>Bring in someone from another Lunch Loop</h3>
                  <p className={helpClass}>People you already share a loop with. Adding one makes them a member right away and emails them. Finish any round underway first.</p>
                  <input value={knownPeopleSearch} onChange={(event) => setKnownPeopleSearch(event.target.value)} placeholder="Search name, email, or loop" className={inputClass} aria-label="Search people from your other Lunch Loops" />
                  <ul className="mt-3 max-h-72 divide-y divide-line overflow-y-auto">
                    {visibleKnownPeople.map((person) => (
                      <li key={person.user_id} className="flex flex-wrap items-center justify-between gap-3 py-3">
                        <div className="min-w-0">
                          <p className="text-[15px] font-semibold">{person.display_name}</p>
                          <p className="truncate text-sm text-subtle">
                            {person.google_full_name && person.google_full_name !== person.display_name ? `${person.google_full_name} · ` : ""}
                            {person.account_email ?? "Email unavailable"}
                          </p>
                          <p className="text-sm text-subtle">Also in {person.shared_loop_names.join(", ")}</p>
                        </div>
                        <button type="button" disabled={saving || availableInvitationCount === 0} onClick={() => void addKnownPerson(person)} className={secondaryButton}>
                          {availableInvitationCount === 0 ? "No open spots" : "Add to this loop"}
                        </button>
                      </li>
                    ))}
                    {!visibleKnownPeople.length && <li className="py-3 text-sm text-muted">No matching people from your other active Lunch Loops.</li>}
                  </ul>
                </div>}
                <form onSubmit={sendMemberInvite} className={subCardClass}>
                  <label className="block">
                    <span className={h3Class}>Invite by email</span>
                    <span className="block text-sm leading-6 text-muted">If a round is underway, they join after it closes.</span>
                    <input required type="email" value={memberInviteEmail} onChange={(event) => setMemberInviteEmail(event.target.value)} placeholder="friend@example.com" className={inputClass} />
                  </label>
                  <button disabled={saving || availableInvitationCount === 0} className={`mt-3 ${primaryButton}`}>
                    {availableInvitationCount === 0 ? "No open crew spots" : saving ? "Creating invite…" : "Send invite"}
                  </button>
                </form>
                <div className={subCardClass}>
                  <h3 className={h3Class}>Or text a code</h3>
                  <p className={helpClass}>Make a one-time code and link. The first person to use it joins.</p>
                  <label className="mt-3 block text-sm font-medium">
                    Who is this for? <span className="font-normal text-subtle">Optional, only you see it.</span>
                    <input value={shareableInviteLabel} onChange={(event) => setShareableInviteLabel(event.target.value)} maxLength={80} placeholder="e.g. Jamie" className={inputClass} />
                  </label>
                  <button type="button" disabled={saving || availableInvitationCount === 0} onClick={() => void createShareableInvite()} className={`mt-3 ${secondaryButton}`}>
                    {saving ? "Creating code…" : "Make a code and link"}
                  </button>
                </div>
              </> : <p className="mt-4 text-[15px] leading-6 text-muted">Only the owner can add someone to this Lunch Loop. You can still help a friend start their own crew below.</p>}
              {inviteShare && (
                <div className="mt-4 rounded-[var(--ll-radius-md)] bg-accent-soft p-4">
                  <p className="text-[15px] font-semibold">{inviteShare.kind === "share-code" ? `Invite${inviteShare.label ? ` for ${inviteShare.label}` : ""} is ready` : inviteShare.emailSent ? `Sent to ${inviteShare.recipient}` : `Ready to share with ${inviteShare.recipient}`}</p>
                  <p className={helpClass}>{inviteShare.kind === "share-code" ? "Text this link or code to one person. Whoever redeems it first joins the crew." : inviteShare.kind === "member" ? "Email is optional. Copy the link and code to text it instead." : "Copy this link if you’d rather text it yourself."}</p>
                  <p className="mt-3 break-all rounded-[var(--ll-radius-sm)] bg-surface px-3 py-2 text-sm">{inviteShare.url}</p>
                  {inviteShare.code && <p className="mt-2 text-[15px] font-semibold">One-time code: <code className="tracking-widest">{inviteShare.code}</code></p>}
                  <button type="button" onClick={copyInviteCode} className={`mt-3 ${primaryButton}`}>Copy invite message</button>
                </div>
              )}
              {context.role === "owner" && (memberInvitations.length > 0 || shareableInvitations.length > 0) && (
                <div className="mt-5">
                  <h3 className={h3Class}>Sent invitations</h3>
                  <ul className="mt-2 divide-y divide-line rounded-[var(--ll-radius-md)] border border-line">
                    {shareableInvitations.slice(0, 6).map((invite) => (
                      <li key={invite.id} className="flex flex-wrap items-center justify-between gap-2 px-4 py-2 text-sm">
                        <span className="min-w-0 truncate"><span className="font-semibold">{invite.invite_label || "Unnamed friend"}</span> · code · {invite.status}{invite.status === "pending" ? ` · expires ${new Date(invite.expires_at).toLocaleDateString()}` : ""}</span>
                        {invite.status === "pending" && <button disabled={saving} onClick={() => void revokeShareableInvite(invite)} className="min-h-10 px-2 font-medium text-danger">Revoke</button>}
                      </li>
                    ))}
                    {memberInvitations.slice(0, 8).map((invite) => (
                      <li key={invite.id} className="flex flex-wrap items-center justify-between gap-2 px-4 py-2 text-sm">
                        <span className="min-w-0 truncate">{invite.recipient_email} · {invite.status}</span>
                        {invite.status === "pending" && <button disabled={saving} onClick={() => void revokeMemberInvite(invite)} className="min-h-10 px-2 font-medium text-danger">Revoke</button>}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </section>

            <form onSubmit={sendNewLoopInvite} className={cardClass}>
              <label className="block">
                <span className={h2Class}>Know someone who needs their own loop?</span>
                <span className="mt-1 block text-sm leading-6 text-muted">They become the owner of a separate crew, list, and history.</span>
                <input required type="email" value={newLoopInviteEmail} onChange={(event) => setNewLoopInviteEmail(event.target.value)} placeholder="friend@example.com" className={inputClass} />
              </label>
              <button disabled={saving} className={`mt-3 ${secondaryButton}`}>{saving ? "Creating invite…" : "Invite them to start a loop"}</button>
            </form>
            </>}

            {settingsTab === "area" && <>
            <section className={cardClass}>
              <h2 className={h2Class}>Where does {context.groupName} eat?</h2>
              <p className={helpClass}>Each Lunch Loop has its own home location, search radius, and time zone.</p>
              {context.role === "owner" ? <>
                <div className="mt-4"><LoopAreaPicker value={homeArea} onChange={setHomeArea} disabled={saving} /></div>
                <button type="button" disabled={saving || !homeArea.label || homeArea.lat === null || homeArea.lng === null || !homeArea.timeZone} onClick={() => void saveHomeArea()} className={`mt-4 ${primaryButton}`}>{saving ? "Saving…" : "Save area and time zone"}</button>
              </> : (
                <p className="mt-4 rounded-[var(--ll-radius-md)] bg-surface-muted p-4 text-[15px]">
                  <span className="font-semibold">{homeArea.label || "Home area not set yet"}</span>
                  {homeArea.label ? ` · ${homeArea.radiusMiles} mile search radius` : ". Ask the owner to set it before adding places."}
                </p>
              )}
            </section>
            {loops.length > 1 && (
              <section className={cardClass}>
                <h2 className={h2Class}>Your Lunch Loops</h2>
                <p className={helpClass}>Each loop keeps its own people, places, and stats.</p>
                <ul className="mt-3 divide-y divide-line rounded-[var(--ll-radius-md)] border border-line">
                  {loops.map((loop) => (
                    <li key={loop.group_id} className="flex flex-wrap items-center justify-between gap-3 px-4 py-3">
                      <div className="min-w-0">
                        <p className="text-[15px] font-semibold">{loop.group_name}{loop.active && <span className="ml-2 text-sm font-medium text-accent-strong">Current</span>}</p>
                        <p className="text-sm text-subtle">{loop.role} · {loop.member_count}/6 people · {loop.status}</p>
                      </div>
                      {loop.status === "active" && !loop.active && <button disabled={saving} onClick={() => void switchLoop(loop)} className={secondaryButton}>Switch</button>}
                    </li>
                  ))}
                </ul>
              </section>
            )}
            </>}

            {settingsTab === "places" && <>
            <section className="mt-6">
              <h2 className={h2Class}>Lunch database</h2>
              <p className={helpClass}>
                {context.role === "owner"
                  ? "Search, filter, and sort the list your crew uses. You can retire a place or remove an accidental entry."
                  : "Search, filter, and sort your crew’s list. Only the owner can retire or remove places."}
              </p>
              <RestaurantDatabaseBrowser
                restaurants={restaurants}
                timeZone={homeArea.timeZone}
                actions={
                  context.role === "owner"
                    ? (restaurant) => (
                        <div className="flex flex-wrap gap-2">
                          <button type="button" onClick={() => void toggleNeverAgain(restaurant)} className={secondaryButton}>
                            {restaurant.never_again ? "Restore" : "Never again"}
                          </button>
                          <button type="button" onClick={() => void deleteRestaurant(restaurant)} className={dangerButton}>
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
            <section className={cardClass}>
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                <h2 className={h2Class}>Discord notifications</h2>
                <span className={`rounded-full px-2.5 py-1 text-sm font-medium ${discord.webhook_configured ? (discord.enabled ? "bg-accent-soft text-accent-ink" : "bg-surface-muted text-muted") : "bg-surface-muted text-muted"}`}>
                  {discord.webhook_configured ? (discord.enabled ? "Connected" : "Paused") : "Not connected"}
                </span>
              </div>
              <p className={helpClass}>Optional. Send Lunch Loop moments to one Discord channel. The webhook URL stays private and is never shown again after you save it.</p>
              <details className="mt-4 rounded-[var(--ll-radius-md)] border border-line px-4 py-3">
                <summary className="cursor-pointer text-[15px] font-medium">How to get a webhook URL</summary>
                <ol className="mt-3 list-decimal space-y-2 pl-5 text-[15px] leading-6 text-muted">
                  <li>In Discord, choose the server and text channel for your updates.</li>
                  <li>Open <span className="font-semibold text-ink">Server Settings → Integrations → Webhooks</span>, then choose <span className="font-semibold text-ink">New Webhook</span>.</li>
                  <li>Choose that channel, copy the webhook URL, and paste it below.</li>
                </ol>
                <p className="mt-3 text-sm leading-6 text-muted">Only paste a webhook for a server you manage. Anyone with its URL can post to that channel.</p>
              </details>
              <label className="mt-4 block text-[15px] font-medium">
                Webhook URL
                <input
                  type="url"
                  value={discordWebhook}
                  onChange={(event) => setDiscordWebhook(event.target.value)}
                  autoComplete="off"
                  placeholder={discord.webhook_configured ? "Leave blank to keep the connected webhook" : "https://discord.com/api/webhooks/..."}
                  className={inputClass}
                />
              </label>
              <label className="mt-4 flex min-h-11 items-center gap-3 text-[15px] font-medium">
                <input
                  type="checkbox"
                  checked={discord.enabled}
                  onChange={(event) => setDiscord((current) => ({ ...current, enabled: event.target.checked }))}
                  className="size-5 accent-[var(--ll-accent-strong)]"
                />
                Send Discord notifications
              </label>
              <ul className="mt-2 divide-y divide-line rounded-[var(--ll-radius-md)] border border-line">
                {discordEvents
                  .filter((event) => context.loopType === "standing" || event.id !== "next_turn")
                  .map((event) => (
                    <li key={event.id}>
                      <label className="flex gap-3 px-4 py-3">
                        <input
                          type="checkbox"
                          checked={discord.enabled_events.includes(event.id)}
                          onChange={() => toggleDiscordEvent(event.id)}
                          className="mt-1 size-5 shrink-0 accent-[var(--ll-accent-strong)]"
                        />
                        <span>
                          <span className="block text-[15px] font-medium">{event.label}</span>
                          <span className="block text-sm leading-6 text-muted">{event.description}</span>
                        </span>
                      </label>
                    </li>
                  ))}
              </ul>
              <div className="mt-4 flex flex-wrap gap-2">
                <button type="button" disabled={saving || discord.enabled_events.length === 0} onClick={() => void saveDiscordSettings()} className={primaryButton}>
                  {saving ? "Saving…" : "Save Discord settings"}
                </button>
                <button type="button" disabled={saving || !discord.webhook_configured || !discord.enabled} onClick={() => void testDiscord()} className={secondaryButton}>
                  Send test message
                </button>
                {discord.webhook_configured && (
                  <button type="button" disabled={saving} onClick={() => void disconnectDiscord()} className={dangerButton}>
                    Disconnect
                  </button>
                )}
              </div>
            </section>
            <section className={cardClass}>
              <h2 className={h2Class}>Your data and ownership</h2>
              <p className={helpClass}>Download a copy whenever you want. If this crew ends, archive it: nothing is permanently removed for 30 days.</p>
              <div className="mt-4 flex flex-wrap gap-2">
                <button type="button" disabled={saving} onClick={() => void exportLoop()} className={secondaryButton}>Download data export</button>
                {members.length > 1 && (
                  <select defaultValue="" onChange={(event) => void transferOwnership(event.target.value)} disabled={saving} className={`${secondaryButton} pr-8`} aria-label="Transfer ownership">
                    <option value="">Transfer ownership…</option>
                    {members.filter((member) => member.user_id !== context.userId).map((member) => <option key={member.user_id} value={member.user_id}>{member.display_name}</option>)}
                  </select>
                )}
              </div>
              <div className="mt-5 border-t border-line pt-4">
                <button type="button" disabled={saving} onClick={() => void archiveLoop()} className={`${dangerButton} -ml-4`}>Archive this Lunch Loop</button>
                <p className="text-sm leading-6 text-muted">Archiving pauses access and starts a 30-day recovery window. Permanent deletion stays unavailable until that window ends.</p>
              </div>
            </section>
            </>}
          </>
        )
      )}
      {error && context && (
        <p role="alert" className="mt-4 rounded-[var(--ll-radius-md)] bg-danger-soft px-4 py-3 text-[15px] font-medium text-danger">
          {error}
        </p>
      )}
      {message && (
        <p role="status" className="mt-4 rounded-[var(--ll-radius-md)] bg-accent-soft px-4 py-3 text-[15px] font-medium text-accent-ink">
          {message}
        </p>
      )}
    </AppFrame>
  );
}
