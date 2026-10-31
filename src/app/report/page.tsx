import type { Metadata } from "next";
import { ReportScreen } from "@/components/report-screen";
import { requirePageUser } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Loop report | Lunch Loop" };

export default async function Report() {
  await requirePageUser("/report");
  return <ReportScreen />;
}
