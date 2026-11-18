import { hasPermission, type Permission } from "@/lib/auth/permissions";
import { filtersKey } from "@/lib/crm/filters-key";
import { segmentHref, type CustomerSegment } from "@/lib/crm/segment-rules";
import { withLocale } from "@/lib/i18n/routing";
import type { Locale } from "@/lib/i18n/locales";
import type { SegmentOption } from "./campaign-editor";

/**
 * The Segments a campaign can be sent to, each with a link to its Customers
 * list for Staff holding `customers` (PRD-crm-retention-loop slice 02). The
 * link is the Segment chip's own: the list with its filters. `filtersKey` is
 * how a Playbook finds its Segment (PRD-email-funnel slice 04): null for one
 * that needs review, so a Playbook never picks it.
 */
export function segmentOptions(
    segments: readonly (Pick<CustomerSegment, "id" | "name" | "params"> & { needsReview?: boolean })[],
    ctx: { readonly permissions: ReadonlySet<Permission> },
    locale: Locale,
): SegmentOption[] {
    const listPath = withLocale("/settings/customers", locale);
    const canSeeCustomers = hasPermission(ctx, "customers");
    return segments.map((s) => ({
        id: s.id,
        name: s.name,
        customersHref: canSeeCustomers ? segmentHref(listPath, s.params) : null,
        filtersKey: s.needsReview ? null : filtersKey(s.params),
    }));
}
