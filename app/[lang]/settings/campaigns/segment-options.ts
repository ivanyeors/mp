import { hasPermission, type Permission } from "@/lib/auth/permissions";
import { segmentHref, type CustomerSegment } from "@/lib/crm/segment-rules";
import { withLocale } from "@/lib/i18n/routing";
import type { Locale } from "@/lib/i18n/locales";
import type { SegmentOption } from "./campaign-editor";

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
