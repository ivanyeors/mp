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
const admins = read("app/[lang]/settings/admins/admins-client.tsx");
const staff = read("app/[lang]/settings/staff-management/staff-management-client.tsx");
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

// admins: pending under email; fluid role select; card min-w-0
assert.match(admins, /flex min-w-0 flex-col gap-1/);
assert.match(admins, /w-full min-w-0 sm:w-36/);
assert.match(admins, /Card className="min-w-0"/);

// staff: relaxed widths; UUID hidden on xs
assert.match(staff, /sm:w-\[260px\]/);
assert.match(staff, /hidden sm:table-cell/);

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

// analytics date chips ≥44px; journey filters fluid + min-h-11
assert.match(analytics, /inline-flex min-h-11 items-center/);
assert.match(journey, /min-h-11 w-full sm:w-\[220px\]/);
assert.match(journey, /min-h-11 w-full sm:w-\[180px\]/);

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
