"use client";

import { useState, type ReactNode } from "react";
import { InfoTip } from "@/components/ui/info-tip";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { TelegramUpdatesCard, type TelegramUpdatesCardData } from "./telegram-updates-card";
import { parseCustomersView, type CustomersView } from "./views";

/**
 * The Customers page: the list, and a *Settings* tab for the CRM's settings
 * cards (CRM slice 14's Telegram updates; slice 07's Aftercare card joins it).
 * The tab is kept in `?view=` so it can be linked and survives a reload.
 */
export function CustomersPageTabs({
  initialView,
  canEdit,
  canEditOnlineResult,
  telegramUpdates,
  children,
}: {
  initialView: CustomersView;
  /** `customers-edit`. */
  canEdit: boolean;
  /** `customers-edit` and `results`. */
  canEditOnlineResult: boolean;
  /** Read by the page when it opens on the Settings tab; otherwise the card fetches it. */
  telegramUpdates?: TelegramUpdatesCardData;
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
      <div className="flex items-center gap-1.5">
        <h1 className="text-2xl font-semibold tracking-tight">Customers</h1>
        <InfoTip label="About Customers">
          <p>Browse and manage your customer accounts.</p>
        </InfoTip>
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
