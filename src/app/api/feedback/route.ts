import { z } from "zod";
import { apiError, requireSameOrigin } from "@/lib/api";
import { notifyCraig } from "@/lib/email";
import { requireAuthenticatedSupabase } from "@/lib/supabase/server";

const bodySchema = z.object({ kind: z.enum(["bug", "feature", "question", "other"]), title: z.string().trim().min(3).max(140), details: z.string().trim().min(10).max(5000), pagePath: z.string().max(500).optional(), build: z.string().max(80).optional() });

export async function POST(request: Request) {
  try {
    requireSameOrigin(request);
    const body = bodySchema.parse(await request.json());
    const { supabase, user } = await requireAuthenticatedSupabase();
    const { data: feedbackId, error } = await supabase.rpc("submit_lunch_loop_feedback", {
      new_kind: body.kind,
      new_title: body.title,
      new_details: body.details,
      new_page_path: body.pagePath ?? null,
      new_build: body.build ?? null,
    });
    if (error) throw error;
    await notifyCraig(`New ${body.kind} feedback`, `${user.email ?? "A Lunch Loop user"} submitted: ${body.title}\n\n${body.details}`);
    return Response.json({ feedbackId });
  } catch (error) {
    return apiError(error);
  }
}
