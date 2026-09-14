import { PageFaqSection } from "@/components/page-faq/page-faq-section";
import { ConfiguratorSeoIntro } from "@/components/seo/configurator-seo-intro";
import { getPageFaq } from "@/lib/page-faq";
import { getConfiguratorOfferRange } from "@/lib/seo/configurator-offer-range";
import { buildConfiguratorProductJsonLd } from "@/lib/seo/jsonld-product";
import { getSiteOrigin } from "@/lib/site-url";
import { getAdminContext } from "@/lib/auth/admin";
import { roleHasPermission } from "@/lib/auth/permissions";
import { getPartnerByCode } from "@/lib/referrals";
import { getStaffByAssistCode } from "@/lib/assist-link";
import { loadResumeFinish } from "@/lib/results/resume-finish";
import { DEFAULT_LOCALE, isSupportedLocale, type Locale } from "@/lib/i18n/locales";
import { MpConfigClient } from "./mp-config-client";

const INTRO: Record<Locale, { h1: string; lede: string }> = {
  "en-US": {
    h1: "Customise Your Mpillow Cervical Pillow",
    lede:
      "Customise your Mpillow cervical pillow for Singapore sleepers who need a true custom fit — part of our Science of Sleep approach with in-store fitting for neck pain relief. Pick Basic or Premium, choose size and cover, then book an in-store fitting so height, width, and support match your neck and sleep position. Our modular design targets cervical alignment and long-term comfort — not a one-size foam block you cannot adjust after purchase.",
  },
  "zh-CN": {
    h1: "定制您的 Mpillow 枕头",
    lede:
      "为需要真正贴合的新加坡睡眠者定制 Mpillow 颈椎枕。选择基础款或高级款，挑选尺寸与面料，再预约到店试配，使高度、宽度与承托匹配您的颈部与睡姿。模块化设计面向缓解颈椎不适、人体工学对齐与长期舒适，而非无法调节的一刀切泡沫枕。",
  },
};

type Props = {
  params: Promise<{ lang: string }>;
  searchParams: Promise<{ partner?: string; assist?: string; result?: string; token?: string }>;
};

export default async function MpConfigPage({ params, searchParams }: Props) {
  const { lang } = await params;
  const {
    partner: partnerCode,
    assist: assistCode,
    result: resultId,
    token: resultToken,
  } = await searchParams;
  const locale: Locale = isSupportedLocale(lang) ? lang : DEFAULT_LOCALE;
  const intro = INTRO[locale];
  // Staff assist gate: existing Staff check (admin_users / bootstrap). Guests get null.
  // Partner-assist (#78) is INDEPENDENT of staff auth — it comes from the ?partner
  // URL code, re-resolved server-side (never a client-supplied id).
  // The Assist link (?assist=) is a THIRD, independent axis — see the prop below.
  const [offer, faq, staffCtx, partner, assistStaff, resumeFinish] = await Promise.all([
    getConfiguratorOfferRange("pillow"),
    getPageFaq("mp-config", locale),
    getAdminContext(),
    partnerCode ? getPartnerByCode(partnerCode) : Promise.resolve(null),
    assistCode ? getStaffByAssistCode(assistCode) : Promise.resolve(null),
    // Finish link from the "choose your finish" email (ADR 0017). Null for
    // anything not openable, which falls through to the ordinary configurator.
    resultId ? loadResumeFinish(resultId, resultToken) : Promise.resolve(null),
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
      {/* Crawlable SEO shell; UI lives in the What-to-Expect (i) dialog */}
      <div className="sr-only">
        <ConfiguratorSeoIntro h1={intro.h1} answerLede={intro.lede} jsonLd={jsonLd} />
        <PageFaqSection surfaceKey="mp-config" locale={locale} />
      </div>
      {resumeFinish ? (
        // The customer's finish, not a new session: no assist chrome, no Assist
        // link, no partner. Even on a Staff device the fillings stay read-only —
        // Staff change them on the Result, not here.
        <MpConfigClient info={info} resumeFinish={resumeFinish} />
      ) : (
      <MpConfigClient
        info={info}
        // Assist edits a live Result — size, tier, filling mix — so it needs the
        // `results` permission, not mere back-office membership. `viewer` is the
        // read-only role and must not reach the editor.
        staffAssist={Boolean(staffCtx && roleHasPermission(staffCtx.role, "results"))}
        canViewResults={Boolean(staffCtx && roleHasPermission(staffCtx.role, "results"))}
        // Assist link (PRD staff-assisted-customisation). Deliberately NOT merged
        // into `staffAssist` above: that gate governs the x-ray editor and turns
        // on a Staff SESSION, while a customer holding a link has no admin_users
        // row at all (getAdminContext() is null for them). Collapsing the two
        // would hand the editor to every customer holding a link. This prop only
        // travels back to the server on save, where the code is re-resolved and
        // the Draft Result stamped `source = 'staff_assisted'`.
        assistCode={assistStaff?.code ?? null}
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
