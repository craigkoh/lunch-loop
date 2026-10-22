import { z } from "zod";
import { apiError, jsonNoStore, requireSameOrigin } from "@/lib/api";
import { notifyCraig } from "@/lib/email";
import { requireAuthenticatedSupabase } from "@/lib/supabase/server";

const bodySchema = z.object({
  kind: z.enum(["bug", "feature", "question", "other"], { error: "Choose what kind of note this is." }),
  title: z.string().trim().min(3, "Add a short title.").max(140, "That title is too long."),
  details: z.string().trim().min(10, "Add a few more details.").max(5000, "Those details are too long."),
  pagePath: z.string().max(500, "That page could not be saved with this note.").optional(),
  build: z.string().max(80, "That build could not be saved with this note.").optional(),
  creditOptIn: z.boolean({ error: "Check the credit box again." }).optional(),
  creditName: z.string().trim().max(60, "Credit names can be up to 60 characters.").optional(),
});

export async function POST(request: Request) {
  try {
    requireSameOrigin(request);
    const body = bodySchema.parse(await request.json());
    const { supabase } = await requireAuthenticatedSupabase();
    const { data: feedbackId, error } = await supabase.rpc("submit_lunch_loop_feedback", {
      new_kind: body.kind,
      new_title: body.title,
      new_details: body.details,
      new_page_path: body.pagePath ?? null,
      new_build: body.build ?? null,
      new_credit_opt_in: body.creditOptIn ?? false,
      new_credit_name: body.creditOptIn ? body.creditName ?? null : null,
    });
    if (error) throw error;
    const creditLine = body.creditOptIn && body.creditName?.trim()
      ? `Credit opt-in: yes (${body.creditName.trim()})`
      : "Credit opt-in: no";
    await notifyCraig(
      `New ${body.kind} feedback`,
      [
        "A Lunch Loop member submitted feedback.",
        "",
        body.title,
        "",
        body.details,
        "",
        `Page: ${body.pagePath ?? "not provided"}`,
        `Build: ${body.build ?? "not provided"}`,
        creditLine,
      ].join("\n"),
    );
    return jsonNoStore({ feedbackId });
  } catch (error) {
    return apiError(error);
  }
}
