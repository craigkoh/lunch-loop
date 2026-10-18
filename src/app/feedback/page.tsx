import { FeedbackScreen } from "@/components/feedback-screen";
import { requirePageUser } from "@/lib/supabase/server";

export default async function FeedbackPage() {
  await requirePageUser("/feedback");
  return <FeedbackScreen />;
}
