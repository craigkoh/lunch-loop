import { z } from "zod";
import { apiError, requireSameOrigin } from "@/lib/api";
import { escapeHtml, sendLunchLoopEmail } from "@/lib/email";
import { requireAuthenticatedSupabase } from "@/lib/supabase/server";

const bodySchema = z.object({ groupId: z.string().uuid(), email: z.string().email().max(320) });

export async function POST(request: Request) {
  try {
    requireSameOrigin(request);
    const body = bodySchema.parse(await request.json());
    const { supabase } = await requireAuthenticatedSupabase();
    const { data, error } = await supabase.rpc("create_group_member_invitation", {
      target_group: body.groupId,
      target_email: body.email,
    });
    if (error) throw error;
    const invite = data?.[0];
    if (!invite) throw new Error("The invitation could not be created.");
    const inviteUrl = new URL("/join", request.url);
    inviteUrl.searchParams.set("token", invite.invitation_token);
    const delivery = await sendLunchLoopEmail({
      to: body.email,
      subject: "You’re invited to a Lunch Loop",
      html: `<main style="font-family:Arial,sans-serif;color:#292524;line-height:1.5"><h1 style="color:#ea580c">🍽️ You’re invited to Lunch Loop</h1><p>Join a private restaurant list with your friends—turns, vetoes, and no more “you pick.”</p><p><a href="${inviteUrl.toString()}" style="display:inline-block;background:#f97316;color:white;padding:12px 18px;border-radius:10px;font-weight:700;text-decoration:none">Join the Lunch Loop</a></p><p>Or open <a href="https://lunchloop.app/join">lunchloop.app/join</a> and enter this one-time code: <strong>${escapeHtml(invite.short_code)}</strong>.</p><p>This invitation is for ${escapeHtml(body.email)} and expires in 14 days.</p></main>`,
      text: `You’re invited to Lunch Loop. Join here: ${inviteUrl.toString()}\n\nOr go to https://lunchloop.app/join and enter one-time code ${invite.short_code}. This invitation is for ${body.email} and expires in 14 days.`,
    });
    return Response.json({
      inviteUrl: inviteUrl.toString(),
      shortCode: invite.short_code,
      expiresAt: invite.expires_at,
      emailSent: delivery.sent,
    });
  } catch (error) {
    return apiError(error);
  }
}
