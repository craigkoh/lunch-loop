"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { fuelLinkLabel } from "@/lib/donation";
import { createClient, hasSupabaseEnv } from "@/lib/supabase/client";

export function FuelTheLoopLink() {
  const pathname = usePathname();
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
  if (!enabled || pathname === "/support") return null;
  return (
    <p className="mt-2">
      <Link
        href="/support"
        className="inline-flex min-h-11 items-center justify-center rounded-full bg-orange-100 px-3 py-1.5 text-xs font-black text-orange-900"
      >
        {fuelLinkLabel}
      </Link>
    </p>
  );
}

export function OperatorCredit() {
  return <p>Lunch Loop is run by Craig Kohler.</p>;
}
