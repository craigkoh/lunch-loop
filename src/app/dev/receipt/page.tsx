import { notFound } from "next/navigation";
import { ReceiptPreview } from "./receipt-preview";

export const metadata = { title: "Receipt preview (dev only)", robots: { index: false } };

/** Local-only preview of the pick thank-you styles. Production returns 404. */
export default function ReceiptPreviewPage() {
  if (process.env.NODE_ENV === "production") notFound();
  return <ReceiptPreview />;
}
