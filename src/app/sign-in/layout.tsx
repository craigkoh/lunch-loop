import type { Metadata } from "next";
import type { ReactNode } from "react";

const signInTitle = "Sign in to Lunch Loop";
const signInDescription =
  "Sign in with a one-time email link or Google, then get back to your lunch crew.";

export const metadata: Metadata = {
  title: signInTitle,
  description: signInDescription,
  openGraph: {
    title: signInTitle,
    description: signInDescription,
  },
  twitter: {
    card: "summary_large_image",
    title: signInTitle,
    description: signInDescription,
  },
};

export default function SignInLayout({ children }: { children: ReactNode }) {
  return children;
}
