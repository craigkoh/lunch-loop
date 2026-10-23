import { z } from "zod";
import { apiError, jsonNoStore, requireSameOrigin } from "@/lib/api";
import { escapeHtml, lunchLoopEmailDocument, sendLunchLoopEmail } from "@/lib/email";
import { requireAuthenticatedSupabase } from "@/lib/supabase/server";

const bodySchema = z.object({
  groupId: z.string().uuid("Choose a Lunch Loop."),
  userId: z.string().uuid("Choose a friend to add."),
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
          html: lunchLoopEmailDocument({
            heading: "You’re in a new Lunch Loop",
            bodyHtml: `<p style="margin:0 0 12px">Hi ${escapeHtml(added.display_name ?? "there")}, you’ve been added to <strong>${escapeHtml(added.group_name)}</strong>.</p><p style="margin:0">Its people and restaurant database are separate from your other Lunch Loops. Open the app any time to switch crews and see what is happening.</p>`,
            button: { href: "https://lunchloop.app/loops", label: "Open my Lunch Loops" },
          }),
          text: `You’ve been added to ${added.group_name}. Open your Lunch Loops: https://lunchloop.app/loops`,
        })
      : { sent: false };
    return jsonNoStore({
      displayName: added.display_name ?? "Lunch Loop friend",
      groupName: added.group_name,
      emailSent: delivery.sent,
    });
  } catch (error) {
    return apiError(error);
  }
}
