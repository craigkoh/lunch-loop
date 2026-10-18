import { StatsScreen } from "@/components/stats-screen";
import { requirePageUser } from "@/lib/supabase/server";

export default async function Stats() {
  await requirePageUser("/stats");
  return <StatsScreen />;
}
