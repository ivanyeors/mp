"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { UserRound } from "lucide-react";
import { createSupabaseBrowserClient } from "@/lib/supabase/browser";
import { Button } from "@/components/ui/button";
import { withLocale } from "@/lib/i18n/routing";
import { useI18n } from "@/lib/i18n/use-i18n";

/** Header entry to the customer profile page (signed-in only). */
export function ProfileMenu() {
  const { locale } = useI18n();
  const [signedIn, setSignedIn] = useState(false);

  useEffect(() => {
    const supabase = createSupabaseBrowserClient();
    supabase.auth.getUser().then(({ data }) => setSignedIn(Boolean(data.user)));
    const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => {
      setSignedIn(Boolean(session?.user));
    });
    return () => sub.subscription.unsubscribe();
  }, []);

  if (!signedIn) return null;

  return (
    <Button asChild variant="outline" size="icon" className="h-8 w-8 rounded-full">
      <Link href={withLocale("/account", locale)} aria-label="Account">
        <UserRound className="h-[1.2rem] w-[1.2rem]" />
      </Link>
    </Button>
  );
}
