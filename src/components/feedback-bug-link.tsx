import Link from "next/link";

export function FeedbackBugLink({
  page,
  className = "inline-flex text-sm font-semibold text-accent-strong",
  onClick,
}: {
  page: string;
  className?: string;
  onClick?: () => void;
}) {
  const safePage = page.startsWith("/") && !page.startsWith("//") && !page.includes("\\") ? page : "/";
  return (
    <Link href={`/feedback?page=${encodeURIComponent(safePage)}`} onClick={onClick} className={className}>
      Feedback
    </Link>
  );
}
