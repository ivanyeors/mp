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

/**
 * The Customers page: the list, a *Follow-ups* tab (CRM slice 06: Mine, All,
 * Overdue), a *Reviews* tab (CRM slice 12: Google reviews to match), and a
 * *Settings* tab for the CRM's settings cards (CRM slice 07's Aftercare,
 * slice 14's Telegram updates). The tab is kept in `?view=` so it can be
 * linked and survives a reload.
 */
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
  /** `customers-edit`. */
  canEdit: boolean;
  /** `customers-edit` and `results`. */
  canEditOnlineResult: boolean;
  /** Read by the page when it opens on the Settings tab; otherwise the card fetches it. */
  telegramUpdates?: TelegramUpdatesCardData;
  /** Same, for the Aftercare card. */
  aftercare?: AftercareCardData;
  /** Import from Shopify, when the role holds `customer-import` (migration slice 02). */
  importHref?: string;
  /** Import fittings from the Google Form, under the same permission (ADR 0039). */
  importFittingsHref?: string;
  /** The Follow-ups tab's list from `?scope=`. */
  followUpScope?: FollowUpScope;
  /** The Reviews tab's list from `?scope=`. */
  reviewScope?: ReviewTabScope;
  /** The Customers list. */
  children: ReactNode;
}) {
  const [view, setView] = useState<CustomersView>(initialView);
  // Settings mounts the first time it is opened (its card fetches then), and
  // stays mounted so a change made there survives a look at the list.
  const [settingsSeen, setSettingsSeen] = useState(initialView === "settings");
  // Follow-ups likewise: fetched the first time it is opened.
  const [followUpsSeen, setFollowUpsSeen] = useState(initialView === "followups");
  // Reviews likewise.
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
    // `?scope=` belongs to the tab that was open.
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
        {/* Kept mounted so a search and its page survive a look at Settings. */}
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
