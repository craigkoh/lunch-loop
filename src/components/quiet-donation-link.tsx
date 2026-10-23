"use client";

import { useEffect, useState } from "react";
import { donationLinkLabel, donationUrl } from "@/lib/donation";
import { createClient, hasSupabaseEnv } from "@/lib/supabase/client";

export function QuietDonationLink() {
  const [enabled, setEnabled] = useState(false);
  useEffect(() => {
    if (!hasSupabaseEnv()) return;
    const supabase = createClient();
    void (async () => {
      try {
        const { data, error } = await supabase.rpc("get_donations_enabled");
        setEnabled(!error && data === true);
      } catch {
        setEnabled(false);
      }
    })();
  }, []);
  if (!enabled) return null;
  return (
    <p className="mt-1">
      <a
        href={donationUrl}
        target="_blank"
        rel="noopener noreferrer"
        className="font-bold text-orange-700 underline"
      >
        {donationLinkLabel}
      </a>
    </p>
  );
}

export function OperatorCredit() {
  return <p>Lunch Loop is run by Craig Kohler.</p>;
}
