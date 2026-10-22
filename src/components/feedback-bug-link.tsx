import Link from "next/link";

export function FeedbackBugLink({
  page,
  className = "inline-flex rounded-xl bg-orange-500 px-3 py-1.5 text-xs font-black text-white shadow-sm",
  onClick,
}: {
  page: string;
  className?: string;
  onClick?: () => void;
}) {
  const safePage = page.startsWith("/") && !page.startsWith("//") && !page.includes("\\") ? page : "/";
  return (
    <Link href={`/feedback?page=${encodeURIComponent(safePage)}`} onClick={onClick} className={className}>
      Feedback / Report a bug
    </Link>
  );
}
