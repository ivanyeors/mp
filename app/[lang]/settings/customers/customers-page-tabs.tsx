"use client";

import { useState, type ReactNode } from "react";
import Link from "next/link";
import { Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import { InfoTip } from "@/components/ui/info-tip";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import type { AftercareCardData } from "@/lib/aftercare/settings";
import { AftercareSettingsCard } from "./aftercare-settings-card";
import { TelegramUpdatesCard, type TelegramUpdatesCardData } from "./telegram-updates-card";
import { parseCustomersView, type CustomersView } from "./views";

/**
 * The Customers page: the list, and a *Settings* tab for the CRM's settings
 * cards (CRM slice 07's Aftercare, slice 14's Telegram updates).
 * The tab is kept in `?view=` so it can be linked and survives a reload.
 */
export function CustomersPageTabs({
  initialView,
  canEdit,
  canEditOnlineResult,
  telegramUpdates,
  aftercare,
  importHref,
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
  /** The Customers list. */
  children: ReactNode;
}) {
  const [view, setView] = useState<CustomersView>(initialView);
  // Settings mounts the first time it is opened (its card fetches then), and
  // stays mounted so a change made there survives a look at the list.
  const [settingsSeen, setSettingsSeen] = useState(initialView === "settings");

  const selectView = (next: string) => {
    const value = parseCustomersView(next);
    setView(value);
    if (value === "settings") setSettingsSeen(true);
    const url = new URL(window.location.href);
    if (value === "list") url.searchParams.delete("view");
    else url.searchParams.set("view", value);
    window.history.replaceState(null, "", url);
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-1.5">
          <h1 className="text-2xl font-semibold tracking-tight">Customers</h1>
          <InfoTip label="About Customers">
            <p>Browse and manage your customer accounts.</p>
          </InfoTip>
        </div>
        {importHref && (
          <Button size="sm" variant="outline" className="self-start sm:self-auto" asChild>
            <Link href={importHref}>
              <Upload className="mr-1.5 h-4 w-4" />
              Import from Shopify
            </Link>
          </Button>
        )}
      </div>

      <Tabs value={view} onValueChange={selectView}>
        <TabsList>
          <TabsTrigger value="list">Customers</TabsTrigger>
          <TabsTrigger value="settings">Settings</TabsTrigger>
        </TabsList>
        {/* Kept mounted so a search and its page survive a look at Settings. */}
        <TabsContent value="list" forceMount className="pt-4 data-[state=inactive]:hidden">
          {children}
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
