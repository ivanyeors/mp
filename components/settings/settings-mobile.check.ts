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

// appointments header stacks
assert.match(appointments, /flex-col gap-2 sm:flex-row/);

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
