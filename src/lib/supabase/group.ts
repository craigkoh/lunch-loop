import { createClient } from "./client";

export type GroupContext = {
  groupId: string;
  groupName: string;
  role: "owner" | "member";
  userId: string;
  timeZone: string;
  loopType: "standing" | "occasion";
};

export type LunchLoopSummary = {
  group_id: string;
  group_name: string;
  role: "owner" | "member";
  status: "active" | "suspended" | "archived";
  active: boolean;
  member_count: number;
  created_at: string;
  delete_scheduled_for: string | null;
  home_label: string | null;
  home_lat: number | null;
  home_lng: number | null;
  search_radius_miles: number | null;
  time_zone: string | null;
  loop_type: "standing" | "occasion";
  owner_display_name: string | null;
  owned_loop_limit: number;
};

export async function getMyLunchLoops(): Promise<LunchLoopSummary[]> {
  const supabase = createClient();
  const { data, error } = await supabase.rpc("get_my_lunch_loops");
  if (error) throw error;
  return (data ?? []) as LunchLoopSummary[];
}

export async function getGroupContext(): Promise<GroupContext> {
  const { context } = await getGroupContextWithLoops();
  return context;
}

export async function getGroupContextWithLoops(): Promise<{
  context: GroupContext;
  loops: LunchLoopSummary[];
}> {
  const supabase = createClient();
  const { data: { session }, error: sessionError } = await supabase.auth.getSession();
  const user = session?.user;
  if (sessionError || !user) throw new Error("Sign in to use your lunch group.");

  const groups = await getMyLunchLoops();
  const membership = groups.find((group) => group.active) ??
    groups.find((group) => group.status === "active");
  if (!membership) throw new Error("Create or join an active Lunch Loop first.");
  return {
    context: {
      groupId: membership.group_id,
      groupName: membership.group_name,
      role: membership.role,
      userId: user.id,
      timeZone: membership.time_zone ?? "America/Chicago",
      loopType: membership.loop_type ?? "standing",
    },
    loops: groups,
  };
}

export type GroupMemberRecord = {
  user_id: string;
  rotation_order: number;
  role: "owner" | "member";
  display_name: string;
};

export type LunchLoopHomeSnapshot = {
  context: GroupContext;
  members: GroupMemberRecord[];
  restaurants: import("@/lib/types").Restaurant[];
  completed_count: number;
  last_lunch: { restaurant_id: string; scheduled_for: string } | null;
  current: {
    id: string;
    status: "active" | "chosen";
    scheduled_for: string;
    final_restaurant_id: string | null;
    suggester_id: string;
  } | null;
  candidates: { id: string; restaurant_id: string }[];
  vetoes: { candidate_id: string; user_id: string }[];
};

export async function getLunchLoopHomeSnapshot(): Promise<LunchLoopHomeSnapshot> {
  const supabase = createClient();
  const { data, error } = await supabase.rpc("get_lunch_loop_home_snapshot");
  if (error) throw error;
  if (!data) throw new Error("Your Lunch Loop is not ready yet.");
  return data as LunchLoopHomeSnapshot;
}

export async function getGroupMembers(groupId: string): Promise<GroupMemberRecord[]> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from("group_members")
    .select("user_id, rotation_order, role, nickname, profiles(display_name)")
    .eq("group_id", groupId)
    .order("rotation_order");
  if (error) throw error;
  return (data ?? []).map((member) => ({
    user_id: member.user_id,
    rotation_order: member.rotation_order,
    role: member.role as "owner" | "member",
    display_name:
      member.nickname?.trim() ||
      (member.profiles as unknown as { display_name: string } | null)
        ?.display_name ||
      "Lunch friend",
  }));
}
