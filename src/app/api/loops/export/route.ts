import { NextResponse } from "next/server";
import { z } from "zod";
import { apiError, requireSameOrigin } from "@/lib/api";
import { loopExportCsv, loopExportFileName, type LoopExportData } from "@/lib/loop-export";
import { requireAuthenticatedSupabase } from "@/lib/supabase/server";

const bodySchema = z.object({ groupId: z.string().uuid("Choose a Lunch Loop.") });

/**
 * CSV download of one loop's own data. export_loop_data runs with the
 * signed-in person's session: it refuses anyone who is not a member of that
 * active loop and counts against a 5-a-day per-person limit.
 */
export async function POST(request: Request) {
  try {
    requireSameOrigin(request);
    const body = bodySchema.parse(await request.json());
    const { supabase } = await requireAuthenticatedSupabase();
    const { data, error } = await supabase.rpc("export_loop_data", { target_group: body.groupId });
    if (error) throw error;
    if (!data) throw new Error("Your loop data could not be prepared.");
    const exportData = data as LoopExportData;
    const csv = loopExportCsv(exportData);
    return new NextResponse(csv, {
      status: 200,
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="${loopExportFileName(exportData.loop_name)}"`,
        "Cache-Control": "private, no-store",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch (error) {
    return apiError(error);
  }
}
