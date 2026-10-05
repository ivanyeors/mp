/**
 * Slice 15: settings admin shell / ops pages mobile UX (token asserts).
 * Run: npx tsx components/settings/settings-mobile.check.ts
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const ROOT = process.cwd();
const read = (rel: string) => readFileSync(join(ROOT, rel), "utf8");

const settingsNav = read("components/settings/settings-sidebar-nav.tsx");
const auditLog = read("app/[lang]/settings/audit-log/page.tsx");
const costings = read("app/[lang]/settings/costings/page.tsx");
const members = read("app/[lang]/settings/users/members-tab.tsx");
const staff = read("app/[lang]/settings/users/profiles-tab.tsx");
const appointments = read("app/[lang]/settings/appointments/appointments-client.tsx");
const analytics = read("app/[lang]/settings/analytics/AnalyticsClient.tsx");
const journey = read("app/[lang]/settings/analytics/ProspectJourneyCard.tsx");
const general = read("app/[lang]/settings/general/general-client.tsx");
const shipping = read("app/[lang]/settings/shipping/shipping-client.tsx");
const customers = read("app/[lang]/settings/customers/customers-client.tsx");
const customerDetail = read("app/[lang]/settings/customers/[id]/customer-detail-client.tsx");

// Admin Menu sheet: scroll body clears safe-area + close control
assert.match(settingsNav, /mobilePreset="quick"/);
assert.match(
  settingsNav,
  /overflow-y-auto[^"]*pb-\[calc\(4rem\+var\(--safe-bottom\)\)\]/,
);
assert.match(settingsNav, /min-h-16/);

// audit-log: horizontal scroll inside container (not overflow-hidden clip)
assert.match(auditLog, /min-w-0 overflow-x-auto/);
assert.doesNotMatch(auditLog, /mt-8 overflow-hidden rounded-lg border/);

// costings: stacked full-width header actions + fluid filter
assert.match(costings, /flex flex-col gap-2 sm:flex-row sm:flex-wrap/);
assert.match(costings, /w-full max-w-full sm:w-\[280px\]/);

// Users & permissions → Members: status under email; fluid role select; phone cards, table from sm
assert.match(members, /flex min-w-0 flex-col gap-1/);
assert.match(members, /w-full min-w-0 sm:w-40/);
assert.match(members, /space-y-3 sm:hidden/);
assert.match(members, /hidden min-w-0 sm:block/);

// Staff profiles: rows stack on phones, one line from sm; long emails wrap
assert.match(staff, /flex flex-col gap-2 px-4 py-2\.5 sm:flex-row sm:items-center/);
assert.match(staff, /min-w-0 break-all font-medium/);

// appointments: title + settings gear share one row; phone blurb is short
assert.match(appointments, /flex shrink-0 items-start justify-between gap-3/);
assert.match(appointments, /text-muted-foreground md:hidden/);

// appointments calendar: own toolbar (no FullCalendar header), 3-day phone view,
// tap-to-select, selection bar clears the dock, detail is a Sheet
const calendar = read("components/settings/appointments-calendar.tsx");
assert.match(calendar, /headerToolbar=\{false\}/);
assert.match(calendar, /MOBILE_DEFAULT_VIEW: ViewId = "timeGridThreeDay"/);
assert.match(calendar, /selectLongPressDelay=\{350\}/);
assert.match(calendar, /dateClick=\{handleDateClick\}/);
assert.match(calendar, /max-md:fixed max-md:inset-x-3 max-md:bottom-\[calc\(var\(--app-dock-clearance\)\+0\.25rem\)\]/);
assert.doesNotMatch(calendar, /window\.confirm/);
// summary tiles: 2×2 on a phone; Locations tile opens the gear sheet
assert.match(calendar, /grid grid-cols-2 sm:grid-cols-4/);
assert.match(calendar, /onClick=\{onOpenSettings\}/);
// location dots: always-visible scroll strip on a phone, folded into the legend on desktop
assert.match(calendar, /overflow-x-auto border-t border-border px-3 py-2 text-xs text-muted-foreground md:hidden/);

// appointments gear sheet: bookable-location rows are whole-row tap targets ≥44px
const apptSheet = read("components/settings/appointments-settings-sheet.tsx");
assert.match(apptSheet, /htmlFor=\{`bookable-\$\{loc\.id\}`\}/);
assert.match(apptSheet, /flex min-h-11 cursor-pointer items-center gap-3/);
// sectioned sheet: tab strip scrolls on a phone; day rows and window controls ≥44px
assert.match(apptSheet, /h-auto w-full justify-start overflow-x-auto md:w-fit/);
assert.match(apptSheet, /htmlFor=\{`day-\$\{dow\}`\}/);
assert.match(apptSheet, /min-h-11 min-w-11 shrink-0 md:min-h-8 md:min-w-8/);

// costings: pinned Part column (shared helper) + full-width money inputs; Save
// pinned above the dock. The BOM configure editor reuses the same helper.
const tableSticky = read("components/ui/table-sticky.ts");
const configureCard = read("app/[lang]/settings/inventory/configure/[card]/page.tsx");
assert.match(tableSticky, /sticky left-0 z-10 w-\[9\.5rem\] min-w-\[9\.5rem\]/);
assert.match(costings, /stickyFirstColumnHeadClassName as STICKY_PART_HEAD/);
assert.match(costings, /min-w-\[7\.5rem\]/);
assert.match(configureCard, /pinFirstColumn\b/);
assert.match(costings, /MobileStickyActionBar/);
assert.doesNotMatch(costings, /SelectContent align="start" className="w-\[280px\]"/);

// shared: phone Select drawer ignores desktop width classes; shell clips (not
// scrolls) x-overflow so sticky works, and clears the dock
const select = read("components/ui/select.tsx");
assert.match(select, /cn\(className, "inset-x-0 w-full min-w-0 max-w-none px-0 pt-0"\)/);
assert.match(settingsNav, /overflow-x-clip md:overflow-x-visible/);
assert.match(settingsNav, /pb-\[calc\(0\.75rem\+var\(--app-dock-clearance\)\)\]/);

// analytics date chips ≥44px; journey filters are deliberately compact
// (they float over the pan/zoom graph) but width-bounded so the phone
// toolbar row fits, and the toolbar clears the safe-top inset
assert.match(analytics, /inline-flex min-h-11 items-center/);
assert.match(journey, /h-8 w-\[140px\] min-h-8 text-xs sm:w-\[180px\]/);
assert.match(journey, /h-8 w-\[110px\] min-h-8 text-xs sm:w-\[130px\]/);
assert.match(journey, /top-\[calc\(0\.5rem\+var\(--safe-top\)\)\]/);

// analytics card headers: the Card primitive stacks a CardAction under the
// title + description on a phone. Callers pinning it to row 3 themselves left
// column 2 free, and auto-placement put the description there as a sliver.
const card = read("components/ui/card.tsx");
assert.match(card, /has-data-\[slot=card-action\]:grid-cols-1 sm:has-data-\[slot=card-action\]:grid-cols-\[1fr_auto\]/);
assert.match(card, /"self-start sm:col-start-2 sm:row-span-2 sm:row-start-1 sm:justify-self-end"/);
const visibility = read("app/[lang]/settings/analytics/SearchVisibilityCard.tsx");
for (const [name, src] of [
  ["AnalyticsClient", analytics],
  ["ProductConfigurationCard", read("app/[lang]/settings/analytics/ProductConfigurationCard.tsx")],
  ["SearchVisibilityCard", visibility],
] as const) {
  assert.doesNotMatch(src, /<CardAction[^>]*row-start-3/, `${name}: CardAction placement belongs to the Card primitive`);
}
// Search card: its seven tabs get their own row; on a phone the range strip is a
// full-width row, with short labels while the header is narrow (so it stays tabs,
// not a menu), and delta badges wrap as whole pieces
assert.doesNotMatch(visibility, /<CardAction/);
assert.match(visibility, /<Tabs value=\{range\} onValueChange=\{setRange\} className="w-full sm:min-w-0 sm:flex-1">/);
assert.match(visibility, /<span className="@2xl\/card-header:hidden">\{r\.short\}<\/span>/);
assert.match(visibility, /inline-flex flex-wrap items-center gap-x-1 text-xs/);

// general touch targets; shipping stacks; tag × always visible; pagination wrap
assert.match(general, /min-h-11 min-w-11/);
assert.match(shipping, /flex-col gap-3 sm:flex-row/);
assert.match(customerDetail, /opacity-100/);
assert.doesNotMatch(customerDetail, /group-hover:opacity-100/);
assert.match(customers, /overflow-x-auto/);

// Cross-partition: results delete always visible; orders date stacks; media mobile overlay
const results = read("app/[lang]/settings/results/results-client.tsx");
const orders = read("app/[lang]/settings/orders/orders-client.tsx");
const media = read("app/[lang]/settings/media/media-client.tsx");
assert.doesNotMatch(results, /opacity-0 group-hover:opacity-100/);
assert.match(results, /min-h-11 min-w-11/);
assert.match(orders, /flex w-full flex-col gap-2 sm:w-auto sm:flex-row/);
assert.match(orders, /w-full sm:w-40/);
assert.match(media, /opacity-100 sm:opacity-0 sm:group-hover:opacity-100/);

console.log("settings-mobile.check.ts: ok");
