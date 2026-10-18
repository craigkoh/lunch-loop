import { LunchLoopsScreen } from "@/components/lunch-loops-screen";
import { requirePageUser } from "@/lib/supabase/server";

export default async function LunchLoopsPage() {
  await requirePageUser("/loops");
  return <LunchLoopsScreen />;
}
