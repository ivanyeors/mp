import { hasPermission, type Permission } from "@/lib/auth/permissions";
import { segmentHref, type CustomerSegment } from "@/lib/crm/segment-rules";
import { withLocale } from "@/lib/i18n/routing";
import type { Locale } from "@/lib/i18n/locales";
import type { SegmentOption } from "./campaign-editor";

/**
 * The Segments a campaign can be sent to, each with a link to its Customers
 * list for Staff holding `customers` (PRD-crm-retention-loop slice 02). The
 * link is the Segment chip's own: the list with its filters. Nothing else of
 * a Segment's filters reaches the editor: they can name a Customer, and
 * `campaigns` does not need `customers`. A wanted Segment is matched on the
 * server (lib/email-campaigns/wanted-segment.ts, `FoundSegments`).
 */
export function segmentOptions(
    segments: readonly Pick<CustomerSegment, "id" | "name" | "params">[],
    ctx: { readonly permissions: ReadonlySet<Permission> },
    locale: Locale,
): SegmentOption[] {
    const listPath = withLocale("/settings/customers", locale);
    const canSeeCustomers = hasPermission(ctx, "customers");
    return segments.map((s) => ({
        id: s.id,
        name: s.name,
        customersHref: canSeeCustomers ? segmentHref(listPath, s.params) : null,
    }));
}
