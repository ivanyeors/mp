import { supabaseAdmin } from "@/lib/supabase/server";
import { DEFAULT_LOCALE, type Locale } from "@/lib/i18n/locales";
import {
  DEFAULT_WORK_WITH_US,
  type PartnerRow,
  type PartnersPageRow,
  type ResolvedPartner,
  type ResolvedPartnersPage,
  type WorkWithUsContent,
} from "./types";

function resolveWorkWithUs(
  row: PartnersPageRow | null,
  locale: Locale,
): ResolvedPartnersPage {
  const stored = row?.content?.[locale] ?? row?.content?.[DEFAULT_LOCALE];
  const fallbackStored = row?.content?.[DEFAULT_LOCALE];
  const defaults = DEFAULT_WORK_WITH_US[locale] ?? DEFAULT_WORK_WITH_US[DEFAULT_LOCALE];

  return {
    heroImage: stored?.heroImage ?? fallbackStored?.heroImage ?? defaults.heroImage,
    title: stored?.title ?? defaults.title,
    subtitle: stored?.subtitle ?? defaults.subtitle,
    body: stored?.body ?? defaults.body,
    benefitCards: stored?.benefitCards?.length
      ? stored.benefitCards
      : defaults.benefitCards,
    ctaTitle: stored?.ctaTitle ?? defaults.ctaTitle,
    ctaSubtitle: stored?.ctaSubtitle ?? defaults.ctaSubtitle,
    ctaButtonLabel: stored?.ctaButtonLabel ?? defaults.ctaButtonLabel,
    ctaButtonUrl: stored?.ctaButtonUrl ?? defaults.ctaButtonUrl,
    showMarquee: stored?.showMarquee ?? defaults.showMarquee ?? true,
    updatedAt: row?.updated_at ?? new Date(0).toISOString(),
  };
}

function toResolvedPartner(row: PartnerRow): ResolvedPartner {
  return {
    id: row.id,
    name: row.name,
    logoUrl: row.logo_url,
    websiteUrl: row.website_url,
    description: row.description,
  };
}

export async function getPartnersPageContent(
  locale: Locale,
): Promise<ResolvedPartnersPage> {
  const admin = supabaseAdmin();
  const { data, error } = await admin
    .from("partners_page")
    .select("*")
    .limit(1)
    .maybeSingle();

  if (error) {
    console.error("[getPartnersPageContent]", error.message);
    return resolveWorkWithUs(null, locale);
  }

  return resolveWorkWithUs(data as PartnersPageRow | null, locale);
}

export async function getPartnersPageRow(): Promise<PartnersPageRow | null> {
  const admin = supabaseAdmin();
  const { data, error } = await admin
    .from("partners_page")
    .select("*")
    .limit(1)
    .maybeSingle();

  if (error) {
    console.error("[getPartnersPageRow]", error.message);
    return null;
  }

  return (data as PartnersPageRow) ?? null;
}

export async function getPartners(opts?: {
  includeHidden?: boolean;
}): Promise<ResolvedPartner[]> {
  const admin = supabaseAdmin();
  let query = admin.from("partners").select("*").order("position", { ascending: true });

  if (!opts?.includeHidden) {
    query = query.eq("visible", true);
  }

  const { data, error } = await query;

  if (error) {
    console.error("[getPartners]", error.message);
    return [];
  }

  return ((data as PartnerRow[]) ?? []).map(toResolvedPartner);
}

export async function getPartnerRows(opts?: {
  includeHidden?: boolean;
}): Promise<PartnerRow[]> {
  const admin = supabaseAdmin();
  let query = admin.from("partners").select("*").order("position", { ascending: true });

  if (!opts?.includeHidden) {
    query = query.eq("visible", true);
  }

  const { data, error } = await query;

  if (error) {
    console.error("[getPartnerRows]", error.message);
    return [];
  }

  return (data as PartnerRow[]) ?? [];
}

export type { WorkWithUsContent, PartnersPageRow, PartnerRow, ResolvedPartner, ResolvedPartnersPage };
