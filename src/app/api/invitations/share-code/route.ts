import { z } from "zod";
import { apiError, appOrigin, jsonNoStore, requireSameOrigin } from "@/lib/api";
import { requireAuthenticatedSupabase } from "@/lib/supabase/server";

const bodySchema = z.object({
  groupId: z.string().uuid("Choose a Lunch Loop."),
  label: z.string().trim().max(80, "That label is too long.").optional(),
});

export async function POST(request: Request) {
  try {
    requireSameOrigin(request);
    const body = bodySchema.parse(await request.json());
    const { supabase } = await requireAuthenticatedSupabase();
    const { data, error } = await supabase.rpc("create_group_member_share_invitation", {
      target_group: body.groupId,
      invite_label: body.label || null,
    });
    if (error) throw error;
    const invite = data?.[0];
    if (!invite) throw new Error("The shareable invitation could not be created.");
    const inviteUrl = new URL("/join", appOrigin(request));
    inviteUrl.searchParams.set("code", invite.short_code);
    return jsonNoStore({
      inviteUrl: inviteUrl.toString(),
      shortCode: invite.short_code,
      expiresAt: invite.expires_at,
    });
  } catch (error) {
    return apiError(error);
  }
}
