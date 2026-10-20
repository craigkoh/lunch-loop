import { z } from "zod";
import { apiError, jsonNoStore, requireSameOrigin } from "@/lib/api";
import { notifyCraig } from "@/lib/email";
import { requireAuthenticatedSupabase } from "@/lib/supabase/server";

const bodySchema = z.object({ token: z.string().max(128).optional(), code: z.string().max(32).optional(), displayName: z.string().trim().min(1).max(50).optional() }).refine((value) => value.token || value.code, { message: "Enter an invitation link or code." });

export async function POST(request: Request) {
  try {
    requireSameOrigin(request);
    const body = bodySchema.parse(await request.json());
    const { supabase, user } = await requireAuthenticatedSupabase();
    const { data: groupId, error } = await supabase.rpc("redeem_group_member_invitation", {
      raw_token: body.token ?? "",
      raw_code: body.code ?? null,
      new_display_name: body.displayName ?? null,
    });
    if (error) throw error;
    await notifyCraig("New crew member", `${user.email ?? "A Lunch Loop user"} joined a Lunch Loop.`);
    return jsonNoStore({ groupId });
  } catch (error) {
    return apiError(error);
  }
}
