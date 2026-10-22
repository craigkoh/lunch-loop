import { FeedbackScreen } from "@/components/feedback-screen";
import { requirePageUser } from "@/lib/supabase/server";

export default async function FeedbackPage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string }>;
}) {
  const params = await searchParams;
  const reportedPage = (params.page ?? "").slice(0, 500);
  const nextPath = reportedPage
    ? `/feedback?page=${encodeURIComponent(reportedPage)}`
    : "/feedback";
  await requirePageUser(nextPath);
  return <FeedbackScreen reportedPage={reportedPage} />;
}
