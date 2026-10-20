import { z } from "zod";
import { apiError, appOrigin, jsonNoStore, requireSameOrigin } from "@/lib/api";
import { escapeHtml, sendLunchLoopEmail } from "@/lib/email";
import { requireAuthenticatedSupabase } from "@/lib/supabase/server";

const bodySchema = z.object({ groupId: z.string().uuid(), email: z.string().email().max(320) });

export async function POST(request: Request) {
  try {
    requireSameOrigin(request);
    const body = bodySchema.parse(await request.json());
    const { supabase } = await requireAuthenticatedSupabase();
    const { data, error } = await supabase.rpc("create_loop_creation_invitation", {
      target_group: body.groupId,
      target_email: body.email,
    });
    if (error) throw error;
    const invite = data?.[0];
    if (!invite) throw new Error("The new-loop invitation could not be created.");
    const inviteUrl = new URL("/start", appOrigin(request));
    inviteUrl.searchParams.set("token", invite.invitation_token);
    const safeInviteUrl = escapeHtml(inviteUrl.toString());
    const delivery = await sendLunchLoopEmail({
      to: body.email,
      subject: "Start your own Lunch Loop",
      html: `<main style="font-family:Arial,sans-serif;color:#292524;line-height:1.5"><h1 style="color:#ea580c">🍽️ Build a new Lunch Loop</h1><p>Set up a Lunch Loop for another crew. Pick a name, invite friends, add places, and let the lunch decisions begin.</p><p><a href="${safeInviteUrl}" style="display:inline-block;background:#f97316;color:white;padding:12px 18px;border-radius:10px;font-weight:700;text-decoration:none">Build a Lunch Loop</a></p><p>This invitation is for ${escapeHtml(body.email)} and expires in 14 days.</p></main>`,
      text: `Build a new Lunch Loop: ${inviteUrl.toString()}\n\nThis invitation is for ${body.email} and expires in 14 days.`,
    });
    return jsonNoStore({ inviteUrl: inviteUrl.toString(), expiresAt: invite.expires_at, emailSent: delivery.sent });
  } catch (error) {
    return apiError(error);
  }
}
