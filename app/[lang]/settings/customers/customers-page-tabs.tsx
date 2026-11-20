"use client";

import { useState, type ReactNode } from "react";
import Link from "next/link";
import { Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import { InfoTip } from "@/components/ui/info-tip";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import type { AftercareCardData } from "@/lib/aftercare/settings";
import { AftercareSettingsCard } from "./aftercare-settings-card";
import type { FollowUpScope } from "@/lib/crm/followup-rules";
import { FollowUpsTab } from "./followups-tab";
import type { ReviewTabScope } from "@/lib/crm/reviews";
import { ReviewsTab } from "./reviews-tab";
import { TelegramUpdatesCard, type TelegramUpdatesCardData } from "./telegram-updates-card";
import { parseCustomersView, type CustomersView } from "./views";

export function CustomersPageTabs({
  initialView,
  canEdit,
  canEditOnlineResult,
  telegramUpdates,
  aftercare,
  importHref,
  importFittingsHref,
  followUpScope = "mine",
  reviewScope = "to-match",
  children,
}: {
  initialView: CustomersView;
  canEdit: boolean;
  canEditOnlineResult: boolean;
  telegramUpdates?: TelegramUpdatesCardData;
  aftercare?: AftercareCardData;
  importHref?: string;
  importFittingsHref?: string;
  followUpScope?: FollowUpScope;
  reviewScope?: ReviewTabScope;
  children: ReactNode;
}) {
  const [view, setView] = useState<CustomersView>(initialView);
  const [settingsSeen, setSettingsSeen] = useState(initialView === "settings");
  const [followUpsSeen, setFollowUpsSeen] = useState(initialView === "followups");
  const [reviewsSeen, setReviewsSeen] = useState(initialView === "reviews");

  const selectView = (next: string) => {
    const value = parseCustomersView(next);
    setView(value);
    if (value === "settings") setSettingsSeen(true);
    if (value === "followups") setFollowUpsSeen(true);
    if (value === "reviews") setReviewsSeen(true);
    const url = new URL(window.location.href);
    if (value === "list") url.searchParams.delete("view");
    else url.searchParams.set("view", value);
    if (value !== view) url.searchParams.delete("scope");
    window.history.replaceState(null, "", url);
  };

  return (
    <div className="space-y-4 md:space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-1.5">
          <h1 className="text-2xl font-semibold tracking-tight">Customers</h1>
          <InfoTip label="About Customers">
            <p>Browse and manage your customers.</p>
            <p>
              A customer is <em>signed up</em> once they have signed in with their email.
              Until then they have <em>no account</em>, only a record from checkout or the Shopify import.
            </p>
          </InfoTip>
        </div>
        {(importHref || importFittingsHref) && (
          <div className="flex flex-wrap gap-2">
            {importHref && (
              <Button size="sm" variant="outline" asChild>
                <Link href={importHref}>
                  <Upload className="mr-1.5 h-4 w-4" />
                  Import from Shopify
                </Link>
              </Button>
            )}
            {importFittingsHref && (
              <Button size="sm" variant="outline" asChild>
                <Link href={importFittingsHref}>
                  <Upload className="mr-1.5 h-4 w-4" />
                  Import fittings
                </Link>
              </Button>
            )}
          </div>
        )}
      </div>

      <Tabs value={view} onValueChange={selectView}>
        <TabsList>
          <TabsTrigger value="list">Customers</TabsTrigger>
          <TabsTrigger value="followups">Follow-ups</TabsTrigger>
          <TabsTrigger value="reviews">Reviews</TabsTrigger>
          <TabsTrigger value="settings">Settings</TabsTrigger>
        </TabsList>
        <TabsContent value="list" forceMount className="pt-4 data-[state=inactive]:hidden">
          {children}
        </TabsContent>
        <TabsContent
          value="followups"
          forceMount={followUpsSeen || undefined}
          className="pt-4 data-[state=inactive]:hidden"
        >
          {followUpsSeen ? <FollowUpsTab canEdit={canEdit} initialScope={followUpScope} /> : null}
        </TabsContent>
        <TabsContent
          value="reviews"
          forceMount={reviewsSeen || undefined}
          className="pt-4 data-[state=inactive]:hidden"
        >
          {reviewsSeen ? <ReviewsTab canEdit={canEdit} initialScope={reviewScope} /> : null}
        </TabsContent>
        <TabsContent
          value="settings"
          forceMount={settingsSeen || undefined}
          className="pt-4 data-[state=inactive]:hidden"
        >
          <div className="grid min-w-0 gap-6 lg:grid-cols-2">
            <AftercareSettingsCard canEdit={canEdit} initialData={aftercare} />
            <TelegramUpdatesCard
              canEdit={canEdit}
              canEditOnlineResult={canEditOnlineResult}
              initialData={telegramUpdates}
            />
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}
