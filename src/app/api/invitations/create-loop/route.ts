import { apiError, jsonNoStore, requireSameOrigin } from "@/lib/api";
import { createLoopBodySchema } from "@/lib/create-loop-body";
import { notifyCraig } from "@/lib/email";
import { requireAuthenticatedSupabase } from "@/lib/supabase/server";

export async function POST(request: Request) {
  try {
    requireSameOrigin(request);
    const body = createLoopBodySchema.parse(await request.json());
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
