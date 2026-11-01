"use client";

import { useEffect, useState } from "react";
import { ShieldCheck, UserRound } from "lucide-react";
import { LoginForm } from "@/components/auth/login-form";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import type { SignInTab, SignUpConsent } from "@/lib/auth/sign-in-intent";

/** This device's last tab, so Staff do not land on the Customer tab every time. */
const LAST_TAB_KEY = "mp_sign_in_tab";

function readLastTab(): SignInTab | null {
  try {
    const v = window.localStorage.getItem(LAST_TAB_KEY);
    return v === "staff" || v === "customer" ? v : null;
  } catch {
    return null;
  }
}

function rememberTab(tab: SignInTab) {
  try {
    window.localStorage.setItem(LAST_TAB_KEY, tab);
  } catch {
    // Private mode: the Customer tab stays the default.
  }
}

/**
 * Sign in's two tabs (PRD-campaign-audiences slice 03): **Customer**, the
 * default, where signing in and signing up are one step; **Staff**, for the
 * Admin Panel only. Each tab is its own form with its own destination, so a
 * customer never lands in the Admin Panel and a Staff sign-in never makes a
 * Customer or records consent.
 *
 * The tab comes from the page (`?as=`, or Staff for an Admin Panel
 * destination). With neither, this device's last tab wins, so the team does
 * not have to switch every time.
 */
export function SignInTabs({
  initialTab,
  tabFixed,
  customer,
  staff,
  error,
}: {
  initialTab: SignInTab;
  /** The URL chose the tab: the last tab used here does not override it. */
  tabFixed: boolean;
  customer: { nextPath: string; initialEmail: string; initialSent: boolean; consent?: SignUpConsent };
  staff: { nextPath: string; initialEmail: string };
  error: { tab: SignInTab; message: string } | null;
}) {
  const [tab, setTab] = useState<SignInTab>(initialTab);

  useEffect(() => {
    if (tabFixed || error) return;
    const last = readLastTab();
    // eslint-disable-next-line react-hooks/set-state-in-effect -- localStorage is only readable after mount
    if (last && last !== tab) setTab(last);
    // Once, on mount.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const change = (value: string) => {
    const next = value === "staff" ? "staff" : "customer";
    setTab(next);
    try {
      const url = new URL(window.location.href);
      url.searchParams.set("as", next);
      url.searchParams.delete("error");
      window.history.replaceState(window.history.state, "", url);
    } catch {
      // The tab still changes.
    }
  };

  const errorFor = (t: SignInTab) =>
    error && error.tab === t ? (
      <p role="alert" className="rounded-md border border-destructive/40 bg-destructive/5 p-3 text-sm text-destructive">
        {error.message}
      </p>
    ) : null;

  return (
    <Tabs value={tab} onValueChange={change} className="w-full gap-6">
      <TabsList className="grid w-full grid-cols-2" aria-label="Who is signing in">
        <TabsTrigger value="customer" className="gap-1.5">
          <UserRound className="h-4 w-4" aria-hidden="true" />
          Customer
        </TabsTrigger>
        <TabsTrigger value="staff" className="gap-1.5">
          <ShieldCheck className="h-4 w-4" aria-hidden="true" />
          Staff
        </TabsTrigger>
      </TabsList>

      <TabsContent value="customer" className="space-y-5">
        <div className="space-y-1 text-center">
          <h1 className="text-2xl font-semibold tracking-tight">Sign in or create an account</h1>
          <p className="text-sm text-muted-foreground">
            One step for both, and no password. New here? Your account is made when you confirm your email.
          </p>
        </div>
        {errorFor("customer")}
        <LoginForm
          audience="customer"
          nextPath={customer.nextPath}
          initialEmail={customer.initialEmail}
          initialSent={customer.initialSent}
          consent={customer.consent}
          onStart={() => rememberTab("customer")}
        />
      </TabsContent>

      <TabsContent value="staff" className="space-y-5">
        <div className="space-y-1 text-center">
          <h1 className="text-2xl font-semibold tracking-tight">Staff sign in</h1>
          <p className="text-sm text-muted-foreground">
            For the Mpillow team, to open the Admin Panel. Use the email your invite was sent to.
          </p>
        </div>
        {errorFor("staff")}
        <LoginForm
          audience="staff"
          nextPath={staff.nextPath}
          initialEmail={staff.initialEmail}
          onStart={() => rememberTab("staff")}
        />
      </TabsContent>
    </Tabs>
  );
}
