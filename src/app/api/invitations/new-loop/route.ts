import { z } from "zod";
import { apiError, appOrigin, jsonNoStore, requireSameOrigin } from "@/lib/api";
import { escapeHtml, lunchLoopEmailDocument, sendLunchLoopEmail } from "@/lib/email";
import { requireAuthenticatedSupabase } from "@/lib/supabase/server";

const bodySchema = z.object({
  groupId: z.string().uuid("Choose a Lunch Loop."),
  email: z.string().email("Enter a valid email address.").max(320, "Enter a valid email address."),
});

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
      html: lunchLoopEmailDocument({
        heading: "Build a new Lunch Loop",
        bodyHtml: `<p style="margin:0 0 12px">Set up a Lunch Loop for another crew. Pick a name, invite friends, add places, and let the lunch decisions begin.</p><p style="margin:0">This invitation is for ${escapeHtml(body.email)} and expires in 14 days.</p>`,
        button: { href: safeInviteUrl, label: "Build a Lunch Loop" },
      }),
      text: `Build a new Lunch Loop: ${inviteUrl.toString()}\n\nThis invitation is for ${body.email} and expires in 14 days.`,
    });
    return jsonNoStore({ inviteUrl: inviteUrl.toString(), expiresAt: invite.expires_at, emailSent: delivery.sent });
  } catch (error) {
    return apiError(error);
  }
}
