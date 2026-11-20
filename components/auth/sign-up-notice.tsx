"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";
import { toast } from "sonner";
import { resubscribeMe } from "@/lib/auth/sign-in-actions";
import { SIGN_UP_NOTICE_COOKIE, SIGN_UP_NOTICES, type SignUpNotice } from "@/lib/auth/sign-in-intent";

function takeNotice(): SignUpNotice | null {
  const match = document.cookie.match(new RegExp(`(?:^|; )${SIGN_UP_NOTICE_COOKIE}=([^;]*)`));
  if (!match) return null;
  document.cookie = `${SIGN_UP_NOTICE_COOKIE}=; Max-Age=0; Path=/; SameSite=Lax`;
  const value = decodeURIComponent(match[1] ?? "");
  return (SIGN_UP_NOTICES as readonly string[]).includes(value) ? (value as SignUpNotice) : null;
}

export function SignUpNoticeToast() {
  const pathname = usePathname();

  useEffect(() => {
    const notice = takeNotice();
    if (!notice) return;
    if (notice === "subscribed") {
      toast.success("You're on our email list", {
        description: "Important updates, event invites and offers. Unsubscribe anytime, in your Profile or any email.",
      });
    } else if (notice === "already") {
      toast("You're already on our email list", {
        description: "Change which emails you get in your Profile.",
      });
    } else {
      toast("You unsubscribed from our emails before", {
        description: "We won't send you offers unless you say so.",
        duration: 15000,
        action: {
          label: "Email me again",
          onClick: () => {
            void resubscribeMe().then((r) =>
              r.ok
                ? toast.success("You're on our email list again")
                : toast.error("That didn't save. Turn emails on in your Profile."),
            );
          },
        },
      });
    }
  }, [pathname]);

  return null;
}
