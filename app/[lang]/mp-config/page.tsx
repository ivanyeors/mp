import { PageFaqSection } from "@/components/page-faq/page-faq-section";
import { ConfiguratorSeoIntro } from "@/components/seo/configurator-seo-intro";
import { getPageFaq } from "@/lib/page-faq";
import { getConfiguratorOfferRange } from "@/lib/seo/configurator-offer-range";
import { buildConfiguratorProductJsonLd } from "@/lib/seo/jsonld-product";
import { getSiteOrigin } from "@/lib/site-url";
import { getAdminContext } from "@/lib/auth/admin";
import { discoverySourceChoices } from "@/lib/discovery-source";
import { readDiscoverySourceCatalog } from "@/lib/discovery-source/cached";
import { hasPermission } from "@/lib/auth/permissions";
import { getPartnerByCode } from "@/lib/referrals";
import { getStaffByAssistCode } from "@/lib/assist-link";
import { loadSignedInCustomer, loadSignedInPillowOwner } from "@/lib/customer-pillow/own";
import { readEarnRateToPromise } from "@/lib/points/server";
import { loadResumeFinish } from "@/lib/results/resume-finish";
import { loadResumeDraft } from "@/lib/results/resume-draft";
import { loadStaffEditResult } from "@/lib/results/staff-edit";
import { DEFAULT_LOCALE, isSupportedLocale, type Locale } from "@/lib/i18n/locales";
import {
  DEFAULT_READJUSTMENT_POLICY,
  loadReadjustmentPolicy,
  loadServicePrices,
  type ServicePrices,
} from "@/lib/pricing/service-prices";
import { actingProfile, memberProfiles } from "@/lib/staff/working-as";
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
    edit?: string;
    draft?: string;
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
    draft: draftId,
  } = await searchParams;
  const staffEditRequested = editFlag === "1";
  const locale: Locale = isSupportedLocale(lang) ? lang : DEFAULT_LOCALE;
  const intro = INTRO[locale];
  const [offer, faq, staffCtx, partner, assistStaff, resumeFinish, staffEdit, resumeDraft, discoverySourceOptions] =
    await Promise.all([
      getConfiguratorOfferRange("pillow"),
      getPageFaq("mp-config", locale),
      getAdminContext(),
      partnerCode ? getPartnerByCode(partnerCode) : Promise.resolve(null),
      assistCode ? getStaffByAssistCode(assistCode) : Promise.resolve(null),
      resultId && !staffEditRequested
        ? loadResumeFinish(resultId, resultToken)
        : Promise.resolve(null),
      staffEditRequested ? loadStaffEditResult(resultId) : Promise.resolve(null),
      draftId && !resultId && !staffEditRequested
        ? loadResumeDraft(draftId, resultToken)
        : Promise.resolve(null),
      readDiscoverySourceCatalog().then((catalog) => discoverySourceChoices(catalog, locale)),
    ]);
  const servicePrices: ServicePrices | null = await loadServicePrices(supabaseAdmin()).catch(() => null);
  const liveResultId = staffEdit || resumeFinish ? resultId : resumeDraft?.id;
  const measuring = !liveResultId && staffCtx ? await actingProfile(staffCtx.memberId) : null;
  const measuredByStaff = liveResultId
    ? await supabaseAdmin()
        .from("mp_config_responses")
        .select("measured_by_type")
        .eq("id", liveResultId)
        .maybeSingle()
        .then(({ data }) => data?.measured_by_type === "staff")
    : Boolean(measuring);
  const measurerProfiles =
    staffCtx && !liveResultId && !measuring && !partner && !assistStaff
      ? await memberProfiles(staffCtx.memberId)
      : [];
  const pickMeasurer = measurerProfiles.length > 1 ? measurerProfiles : null;
  const customer = staffCtx ? null : await loadSignedInCustomer();
  const pillowOwner = !assistStaff && !staffEdit && !resumeFinish ? await loadSignedInPillowOwner(customer) : null;
  const [readjustmentPolicy, pointsPerDollar] = await Promise.all([
    loadReadjustmentPolicy(supabaseAdmin()).catch(() => DEFAULT_READJUSTMENT_POLICY),
    readEarnRateToPromise(supabaseAdmin(), customer?.id ?? null),
  ]);

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
      <div className="sr-only">
        <ConfiguratorSeoIntro h1={intro.h1} answerLede={intro.lede} jsonLd={jsonLd} />
        <PageFaqSection surfaceKey="mp-config" locale={locale} />
      </div>
      {staffEdit ? (
        <MpConfigClient
          info={info}
          staffEdit={staffEdit}
          staffAssist
          canViewResults
          servicePrices={servicePrices}
          measuredByStaff={measuredByStaff}
          discoverySourceOptions={discoverySourceOptions}
        />
      ) : resumeFinish ? (
        <MpConfigClient
          info={info}
          resumeFinish={resumeFinish}
          servicePrices={servicePrices}
          measuredByStaff={measuredByStaff}
          discoverySourceOptions={discoverySourceOptions}
        />
      ) : (
      <MpConfigClient
        info={info}
        staffAssist={Boolean(staffCtx && hasPermission(staffCtx, "results"))}
        canViewResults={Boolean(staffCtx && hasPermission(staffCtx, "results"))}
        assistCode={assistStaff?.code ?? null}
        askEmailFirst={!staffCtx}
        resumeDraft={resumeDraft}
        pillowOwner={pillowOwner}
        readjustmentPolicy={readjustmentPolicy}
        pointsPerDollar={pointsPerDollar}
        servicePrices={servicePrices}
        measuredByStaff={measuredByStaff}
        discoverySourceOptions={discoverySourceOptions}
        pickMeasurer={pickMeasurer}
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
