import { z } from "zod";
import { apiError, requireSameOrigin } from "@/lib/api";
import { escapeHtml, sendLunchLoopEmail } from "@/lib/email";
import { requireAuthenticatedSupabase } from "@/lib/supabase/server";

const bodySchema = z.object({
  groupId: z.string().uuid(),
  userId: z.string().uuid(),
});

export async function POST(request: Request) {
  try {
    requireSameOrigin(request);
    const body = bodySchema.parse(await request.json());
    const { supabase } = await requireAuthenticatedSupabase();
    const { data, error } = await supabase.rpc("add_known_lunch_loop_member", {
      target_group: body.groupId,
      target_user: body.userId,
    });
    if (error) throw error;
    const added = data as {
      display_name?: string;
      account_email?: string | null;
      group_name?: string;
    } | null;
    if (!added?.group_name) throw new Error("The Lunch Loop member could not be added.");

    const delivery = added.account_email
      ? await sendLunchLoopEmail({
          to: added.account_email,
          subject: `You’ve been added to ${added.group_name}`,
          html: `<main style="font-family:Arial,sans-serif;color:#292524;line-height:1.5"><h1 style="color:#ea580c">🍽️ You’re in a new Lunch Loop</h1><p>Hi ${escapeHtml(added.display_name ?? "there")}, you’ve been added to <strong>${escapeHtml(added.group_name)}</strong>.</p><p>Its people and restaurant database are separate from your other Lunch Loops. Open the app any time to switch crews and see what is happening.</p><p><a href="https://lunchloop.app/loops" style="display:inline-block;background:#f97316;color:white;padding:12px 18px;border-radius:10px;font-weight:700;text-decoration:none">Open my Lunch Loops</a></p></main>`,
          text: `You’ve been added to ${added.group_name}. Open your Lunch Loops: https://lunchloop.app/loops`,
        })
      : { sent: false };
    return Response.json({
      displayName: added.display_name ?? "Lunch Loop friend",
      groupName: added.group_name,
      emailSent: delivery.sent,
    });
  } catch (error) {
    return apiError(error);
  }
}
