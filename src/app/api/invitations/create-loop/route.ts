import { z } from "zod";
import { apiError, jsonNoStore, requireSameOrigin } from "@/lib/api";
import { notifyCraig } from "@/lib/email";
import { requireAuthenticatedSupabase } from "@/lib/supabase/server";

const bodySchema = z.object({
  token: z.string().min(20).max(128).optional(),
  groupName: z.string().trim().min(1).max(80),
  displayName: z.string().trim().min(1).max(50),
  homeLabel: z.string().trim().min(2).max(160),
  homeLat: z.number().min(-90).max(90),
  homeLng: z.number().min(-180).max(180),
  radiusMiles: z.number().int().min(1).max(35),
  timeZone: z.string().trim().min(1).max(100),
  loopType: z.enum(["standing", "occasion"]).default("standing"),
});

export async function POST(request: Request) {
  try {
    requireSameOrigin(request);
    const body = bodySchema.parse(await request.json());
    const { supabase, user } = await requireAuthenticatedSupabase();
    const rpcArgs = {
      new_group_name: body.groupName,
      new_display_name: body.displayName,
      new_home_label: body.homeLabel,
      new_home_lat: body.homeLat,
      new_home_lng: body.homeLng,
      new_search_radius_miles: body.radiusMiles,
      new_time_zone: body.timeZone,
      new_loop_type: body.loopType,
    };
    const { data: groupId, error } = body.token
      ? await supabase.rpc("redeem_loop_creation_invitation", {
          raw_token: body.token,
          ...rpcArgs,
        })
      : await supabase.rpc("create_first_lunch_loop", rpcArgs);
    if (error) throw error;
    await notifyCraig("New Lunch Loop created", (user.email ?? "A Lunch Loop user") + " created the " + body.loopType + " loop “" + body.groupName + "”.");
    return jsonNoStore({ groupId });
  } catch (error) {
    return apiError(error);
  }
}
