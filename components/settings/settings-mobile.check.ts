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

assert.match(settingsNav, /mobilePreset="quick"\s+hideClose/);
assert.match(settingsNav, /<SheetClose[\s\S]{0,120}size-11/);
assert.match(
  settingsNav,
  /overflow-y-auto[^"]*pb-\[calc\(1rem\+var\(--safe-bottom\)\)\]/,
);
assert.match(settingsNav, /grid grid-cols-3 gap-2/);
assert.match(settingsNav, /min-h-16[^"]*active:bg-press/);

assert.match(auditLog, /min-w-0 overflow-x-auto/);
assert.doesNotMatch(auditLog, /mt-8 overflow-hidden rounded-lg border/);

assert.match(costings, /flex flex-col gap-2 sm:flex-row sm:items-center/);
assert.match(costings, /w-full max-w-full sm:w-\[280px\]/);

assert.match(members, /flex min-w-0 flex-col gap-1/);
assert.match(members, /w-full min-w-0 sm:w-40/);
assert.match(members, /space-y-3 sm:hidden/);
assert.match(members, /hidden min-w-0 sm:block/);

assert.match(staff, /flex flex-col gap-2 px-4 py-2\.5 sm:flex-row sm:items-center/);
assert.match(staff, /min-w-0 break-all font-medium/);

assert.match(appointments, /flex shrink-0 items-start justify-between gap-3/);
assert.match(appointments, /<InfoTip label="About Appointments">/);

const calendar = read("components/settings/appointments-calendar.tsx");
assert.match(calendar, /headerToolbar=\{false\}/);
assert.match(calendar, /MOBILE_DEFAULT_VIEW: ViewId = "timeGridThreeDay"/);
assert.match(calendar, /selectLongPressDelay=\{350\}/);
assert.match(calendar, /dateClick=\{handleDateClick\}/);
assert.match(calendar, /max-md:fixed max-md:inset-x-3 max-md:bottom-\[calc\(var\(--app-dock-clearance\)\+0\.25rem\)\]/);
assert.doesNotMatch(calendar, /window\.confirm/);
assert.match(calendar, /grid grid-cols-2 sm:grid-cols-4/);
assert.match(calendar, /onClick=\{onOpenSettings\}/);
assert.match(calendar, /overflow-x-auto border-t border-border px-3 py-2 text-xs text-muted-foreground md:hidden/);

const apptSheet = read("components/settings/appointments-settings-sheet.tsx");
assert.match(apptSheet, /htmlFor=\{`bookable-\$\{loc\.id\}`\}/);
assert.match(apptSheet, /flex min-h-11 cursor-pointer items-center gap-3/);
assert.match(apptSheet, /<TabsList className="w-full justify-start md:w-fit">/);
assert.match(apptSheet, /htmlFor=\{`day-\$\{dow\}`\}/);
assert.match(apptSheet, /min-h-11 min-w-11 shrink-0 md:min-h-8 md:min-w-8/);

const tableSticky = read("components/ui/table-sticky.ts");
const configureCard = read("app/[lang]/settings/inventory/configure/[card]/page.tsx");
assert.match(tableSticky, /sticky left-0 z-10 w-\[9\.5rem\] min-w-\[9\.5rem\]/);
assert.match(costings, /stickyFirstColumnHeadClassName as STICKY_PART_HEAD/);
assert.match(costings, /<MobileListRow key=\{rowKey\} onClick=\{\(\) => setPartSheetItemId\(item\.id\)\}>/);
assert.match(configureCard, /pinFirstColumn\b/);
assert.match(costings, /MobileStickyActionBar/);
assert.doesNotMatch(costings, /SelectContent align="start" className="w-\[280px\]"/);

const select = read("components/ui/select.tsx");
assert.match(select, /cn\(className, "inset-x-0 w-full min-w-0 max-w-none px-0 pt-0"\)/);
assert.match(settingsNav, /overflow-x-clip md:overflow-x-visible/);
assert.match(settingsNav, /pb-\[calc\(0\.75rem\+var\(--app-dock-clearance\)\)\]/);

assert.match(analytics, /inline-flex min-h-11 flex-1 items-center justify-center[^"]*active:bg-press sm:flex-none/);
assert.ok((journey.match(/className="h-8 w-full min-h-8 text-xs"/g) ?? []).length >= 2, "journey: compact full-width filters");
assert.match(journey, /top-\[calc\(0\.5rem\+var\(--safe-top\)\)\]/);

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
assert.doesNotMatch(visibility, /<CardAction/);
assert.match(visibility, /<Tabs value=\{range\} onValueChange=\{setRange\} className="w-full sm:min-w-0 sm:flex-1">/);
assert.match(visibility, /<span className="@2xl\/card-header:hidden">\{r\.short\}<\/span>/);
assert.match(visibility, /inline-flex flex-wrap items-center gap-x-1 text-xs/);

assert.match(general, /min-h-11 min-w-11/);
assert.match(shipping, /flex-col gap-3 sm:flex-row/);
assert.match(customerDetail, /opacity-100/);
assert.doesNotMatch(customerDetail, /group-hover:opacity-100/);
assert.match(customers, /overflow-x-auto/);

const results = read("app/[lang]/settings/results/results-client.tsx");
const orders = read("app/[lang]/settings/orders/orders-client.tsx");
const media = read("app/[lang]/settings/media/media-client.tsx");
assert.doesNotMatch(results, /opacity-0 group-hover:opacity-100/);
assert.match(results, /min-h-11 min-w-11/);
assert.match(orders, /grid w-full grid-cols-2 gap-2 sm:flex sm:w-auto sm:flex-row/);
assert.match(orders, /w-full sm:w-40/);
assert.match(media, /opacity-100 sm:opacity-0 sm:group-hover:opacity-100/);

console.log("settings-mobile.check.ts: ok");
