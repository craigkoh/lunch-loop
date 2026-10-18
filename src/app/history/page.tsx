import { HistoryScreen } from "@/components/history-screen";
import { requirePageUser } from "@/lib/supabase/server";

export default async function History() {
  await requirePageUser("/history");
  return <HistoryScreen />;
}
