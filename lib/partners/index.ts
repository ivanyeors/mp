import { supabaseAdmin } from "@/lib/supabase/server";
import { branchesByParent, getLocationRows, selectPartnerRows } from "@/lib/locations";
import { DEFAULT_LOCALE, type Locale } from "@/lib/i18n/locales";
import {
  DEFAULT_AGREEMENT_MD,
  DEFAULT_WORK_WITH_US,
  type PartnerPlace,
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

function toPlace(row: PartnerRow): PartnerPlace | null {
  const address = row.address?.trim();
  if (!address) return null;
  return {
    id: row.id,
    branchName: row.branch_name?.trim() || null,
    address,
    postalCode: row.postal_code?.trim() || null,
  };
}

/** A partner with its clinics: the main row's place first, then its branches'. */
function toResolvedPartner(row: PartnerRow, branches: PartnerRow[]): ResolvedPartner {
  return {
    id: row.id,
    name: row.name,
    logoUrl: row.logo_url,
    websiteUrl: row.website_url,
    description: row.description,
    locations: [row, ...branches].map(toPlace).filter((p): p is PartnerPlace => p !== null),
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

/** Owner-editable Partner Agreement markdown; falls back to the placeholder (#87). */
export async function getAgreementMarkdown(): Promise<string> {
  const row = await getPartnersPageRow();
  return row?.agreement_md?.trim() ? row.agreement_md : DEFAULT_AGREEMENT_MD;
}

// Partner projection over the unified locations store (`partners` table): own
// studios are filtered out here so /our-partners only ever shows partner clinics.
export async function getPartners(opts?: {
  includeHidden?: boolean;
}): Promise<ResolvedPartner[]> {
  const all = await getLocationRows();
  const branches = branchesByParent(all);
  return selectPartnerRows(all, opts?.includeHidden).map((row) =>
    toResolvedPartner(row, branches.get(row.id) ?? []),
  );
}

export async function getPartnerRows(opts?: {
  includeHidden?: boolean;
}): Promise<PartnerRow[]> {
  return selectPartnerRows(await getLocationRows(), opts?.includeHidden);
}

export type {
  WorkWithUsContent,
  PartnersPageRow,
  PartnerPlace,
  PartnerRow,
  ResolvedPartner,
  ResolvedPartnersPage,
};

/**
 * Every location row (own + partner, branches included) ordered by position,
 * for the admin Locations table, which nests each partner's branches. Throws on a Supabase error so callers can map it to a
 * status code.
 */
export async function listAdminLocationRows(): Promise<PartnerRow[]> {
  const admin = supabaseAdmin();
  const { data, error } = await admin
    .from("partners")
    .select("*")
    .order("position", { ascending: true });

  if (error) throw new Error(error.message);
  return (data ?? []) as PartnerRow[];
}
