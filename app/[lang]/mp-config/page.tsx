import { PageFaqSection } from "@/components/page-faq/page-faq-section";
import { ConfiguratorSeoIntro } from "@/components/seo/configurator-seo-intro";
import { getPageFaq } from "@/lib/page-faq";
import { getConfiguratorOfferRange } from "@/lib/seo/configurator-offer-range";
import { buildConfiguratorProductJsonLd } from "@/lib/seo/jsonld-product";
import { getSiteOrigin } from "@/lib/site-url";
import { getAdminContext } from "@/lib/auth/admin";
import { hasPermission } from "@/lib/auth/permissions";
import { getPartnerByCode } from "@/lib/referrals";
import { getStaffByAssistCode } from "@/lib/assist-link";
import { loadResumeFinish } from "@/lib/results/resume-finish";
import { loadStaffEditResult } from "@/lib/results/staff-edit";
import { DEFAULT_LOCALE, isSupportedLocale, type Locale } from "@/lib/i18n/locales";
import { loadServicePrices, type ServicePrices } from "@/lib/pricing/service-prices";
import { getWorkingAs } from "@/lib/staff/working-as";
import { supabaseAdmin } from "@/lib/supabase/server";
import { MpConfigClient } from "./mp-config-client";

const INTRO: Record<Locale, { h1: string; lede: string }> = {
  "en-US": {
    h1: "Customise your Mpillow cervical pillow",
    lede:
      "Customise your Mpillow cervical pillow for a true custom fit. Pick Basic or Premium, then choose your size and cover. If you choose Premium in Singapore, book an in-store fitting so the height, width and support match your neck and sleep position. Basic, and Premium from overseas, are measured online. Our modular design supports cervical alignment and lasting comfort, and unlike a one-size foam block, you can adjust it after you buy.",
  },
  "zh-CN": {
    h1: "定制您的 Mpillow 枕头",
    lede:
      "为需要真正贴合的新加坡睡眠者定制 Mpillow 颈椎枕。选择基础款或高级款，挑选尺寸与面料，再预约到店试配，使高度、宽度与承托匹配您的颈部与睡姿。模块化设计面向缓解颈椎不适、人体工学对齐与长期舒适，而非无法调节的一刀切泡沫枕。",
  },
};

type Props = {
  params: Promise<{ lang: string }>;
  searchParams: Promise<{
    partner?: string;
    assist?: string;
    result?: string;
    token?: string;
    /** `1` → Staff re-configuration of an existing Result (lib/results/staff-edit). */
    edit?: string;
  }>;
};

export default async function MpConfigPage({ params, searchParams }: Props) {
  const { lang } = await params;
  const {
    partner: partnerCode,
    assist: assistCode,
    result: resultId,
    token: resultToken,
    edit: editFlag,
  } = await searchParams;
  const staffEditRequested = editFlag === "1";
  const locale: Locale = isSupportedLocale(lang) ? lang : DEFAULT_LOCALE;
  const intro = INTRO[locale];
  // Staff assist gate: existing Staff check (admin_users / bootstrap). Guests get null.
  // Partner-assist (#78) is INDEPENDENT of staff auth — it comes from the ?partner
  // URL code, re-resolved server-side (never a client-supplied id).
  // The Assist link (?assist=) is a THIRD, independent axis — see the prop below.
  const [offer, faq, staffCtx, partner, assistStaff, resumeFinish, staffEdit] =
    await Promise.all([
      getConfiguratorOfferRange("pillow"),
      getPageFaq("mp-config", locale),
      getAdminContext(),
      partnerCode ? getPartnerByCode(partnerCode) : Promise.resolve(null),
      assistCode ? getStaffByAssistCode(assistCode) : Promise.resolve(null),
      // Finish link from the "choose your finish" email (ADR 0017). Null for
      // anything not openable, which falls through to the ordinary configurator.
      resultId && !staffEditRequested
        ? loadResumeFinish(resultId, resultToken)
        : Promise.resolve(null),
      // Staff re-configuration of a live Result. Staff-gated inside the loader,
      // and null for anything not editable — a guest following this link lands
      // on the ordinary configurator and learns nothing about the Result.
      staffEditRequested ? loadStaffEditResult(resultId) : Promise.resolve(null),
    ]);
  // Service fees (ADR 0024). The preview shows the Measurement service only when
  // the server will charge it: a live Result says who measured; a new session on a
  // Staff device working as a profile is stamped `staff` when its Draft is created.
  const servicePrices: ServicePrices | null = await loadServicePrices(supabaseAdmin()).catch(() => null);
  const liveResultId = staffEdit || resumeFinish ? resultId : undefined;
  const measuredByStaff = liveResultId
    ? await supabaseAdmin()
        .from("mp_config_responses")
        .select("measured_by_type")
        .eq("id", liveResultId)
        .maybeSingle()
        .then(({ data }) => data?.measured_by_type === "staff")
    : Boolean(staffCtx && (await getWorkingAs(staffCtx.memberId)));

  const info = {
    h1: intro.h1,
    lede: intro.lede,
    faqTitle: faq?.title ?? null,
    faqItems: faq?.items ?? [],
  };

  const jsonLd = buildConfiguratorProductJsonLd({
    lang: locale,
    path: "/mp-config",
    name: "Mpillow Custom Pillow",
    description: intro.lede,
    image: `${getSiteOrigin()}/basic-mpillow.webp`,
    ...(offer ?? {}),
  });

  return (
    <>
      {/* Crawlable SEO shell; UI lives in the What-to-Expect (i) dialog */}
      <div className="sr-only">
        <ConfiguratorSeoIntro h1={intro.h1} answerLede={intro.lede} jsonLd={jsonLd} />
        <PageFaqSection surfaceKey="mp-config" locale={locale} />
      </div>
      {staffEdit ? (
        // Staff editing a live Result: the full assist editor (x-ray, size×tier,
        // Filling Template) over a build that already exists, saving back to the
        // Result instead of submitting a new hold.
        <MpConfigClient
          info={info}
          staffEdit={staffEdit}
          staffAssist
          canViewResults
          servicePrices={servicePrices}
          measuredByStaff={measuredByStaff}
        />
      ) : resumeFinish ? (
        // The customer's finish, not a new session: no assist chrome, no Assist
        // link, no partner. Even on a Staff device the fillings stay read-only —
        // Staff change them on the Result, not here.
        <MpConfigClient
          info={info}
          resumeFinish={resumeFinish}
          servicePrices={servicePrices}
          measuredByStaff={measuredByStaff}
        />
      ) : (
      <MpConfigClient
        info={info}
        // Assist edits a live Result — size, tier, filling mix — so it needs the
        // `results` permission, not mere back-office membership. `viewer` is the
        // read-only role and must not reach the editor.
        staffAssist={Boolean(staffCtx && hasPermission(staffCtx, "results"))}
        canViewResults={Boolean(staffCtx && hasPermission(staffCtx, "results"))}
        // Assist link (PRD staff-assisted-customisation). Deliberately NOT merged
        // into `staffAssist` above: that gate governs the x-ray editor and turns
        // on a Staff SESSION, while a customer holding a link has no admin_users
        // row at all (getAdminContext() is null for them). Collapsing the two
        // would hand the editor to every customer holding a link. This prop only
        // travels back to the server on save, where the code is re-resolved and
        // the Draft Result stamped `source = 'staff_assisted'`.
        assistCode={assistStaff?.code ?? null}
        // Email first (ADR 0049): anyone on no Admin Panel login is a guest,
        // and their first question asks their email, so the Draft Result Staff
        // see in Results is one they can follow up. A Staff device, an Assist
        // link opened on one included, asks the shopper's email at the end.
        askEmailFirst={!staffCtx}
        servicePrices={servicePrices}
        measuredByStaff={measuredByStaff}
        partner={
          partner
            ? {
                code: partner.code,
                name: partner.name,
                logoUrl: partner.logoUrl,
                description: partner.description,
              }
            : null
        }
      />
      )}
    </>
  );
}
