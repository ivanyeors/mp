import type { Locale } from "@/lib/i18n/locales";

export type BenefitCard = {
  title: string;
  description: string;
};

export type WorkWithUsContent = {
  heroImage?: string;
  media_asset_id?: string | null;
  title?: string;
  subtitle?: string;
  body?: string;
  benefitCards?: BenefitCard[];
  ctaTitle?: string;
  ctaSubtitle?: string;
  ctaButtonLabel?: string;
  ctaButtonUrl?: string;
  showMarquee?: boolean;
};

export type PartnersPageRow = {
  id: string;
  content: Record<string, WorkWithUsContent>;
  /** Owner-editable Partner Agreement markdown; null ⇒ DEFAULT_AGREEMENT_MD (#87). */
  agreement_md?: string | null;
  updated_at: string;
};

export type PartnerRow = {
  id: string;
  name: string;
  logo_url: string | null;
  media_asset_id?: string | null;
  website_url: string | null;
  description: string | null;
  position: number;
  visible: boolean;
  // Location columns (ADR 0012 — additive on `partners`, no rename)
  type: "own" | "partner";
  address: string | null;
  postal_code: string | null;
  created_at: string;
  updated_at: string;
};

export type ResolvedPartnersPage = WorkWithUsContent & {
  updatedAt: string;
};

export type ResolvedPartner = {
  id: string;
  name: string;
  logoUrl: string | null;
  websiteUrl: string | null;
  description: string | null;
};

/**
 * Placeholder Partner Agreement copy (#87). Used when partners_page.agreement_md is
 * unset. PLACEHOLDER wording — owner/lawyer edits it in Admin → Partners → Agreement.
 * Section 3 is the MANDATORY AHPC §5.7/§5.7.1 patient-disclosure clause (ADR 0015);
 * it must be retained in any final copy.
 */
export const DEFAULT_AGREEMENT_MD = `## 1. The Partner Programme

[PLACEHOLDER] This agreement governs your participation in the Mpillow Partner programme operated by Mellow Life Pte Ltd, including referral attribution, commissions, and use of Mpillow materials.

## 2. Commissions and Payment

[PLACEHOLDER] Commission rates, qualifying orders, void conditions, and manual payout terms to be confirmed by counsel.

## 3. Patient-Facing Disclosure (AHPC §5.7 / §5.7.1)

[PLACEHOLDER — counsel to finalise, clause is MANDATORY] Where you are a registered allied health professional, you must disclose to each client, before any recommendation or referral, that you have a financial interest in Mpillow products. Your product recommendations must be based on the client's clinical needs and must not be influenced by any reward, commission, or incentive under this programme, consistent with the AHPC Code of Professional Conduct §5.7 and §5.7.1.

## 4. Term and Changes

[PLACEHOLDER] We may update this agreement. When the terms change, the version changes and you will be asked to accept the updated agreement before continuing to use the Partner Hub.`;

export const DEFAULT_WORK_WITH_US: Record<Locale, WorkWithUsContent> = {
  "en-US": {
    title: "Partner with Mpillow — clinical sleep support in Singapore",
    subtitle:
      "For chiropractors, physiotherapists, and wellness coaches who want a customisable cervical pillow to recommend after assessment.",
    body: "",
    benefitCards: [
      {
        title: "Clinical credibility",
        description:
          "Trusted by chiropractors, physiotherapists, and sleep specialists across Singapore.",
      },
      {
        title: "Co-marketing",
        description: "Collaborate on content, events, and patient education.",
      },
      {
        title: "Dedicated support",
        description: "Product demos, fitting guidance, and ongoing partner care.",
      },
    ],
    ctaTitle: "Ready to partner?",
    ctaSubtitle: "Reach out for a product demo and see how Mpillow can support your practice.",
    ctaButtonLabel: "Request a demo",
    ctaButtonUrl: "/partner/apply",
    showMarquee: true,
  },
  "zh-CN": {
    title: "与我们合作",
    subtitle: "如果您认为 Mpillow 能为您的患者和客户带来价值，欢迎联系我们预约产品演示。",
    body: "",
    benefitCards: [
      { title: "临床可信度", description: "受到新加坡脊骨神经科医生、物理治疗师和睡眠专家的信赖。" },
      { title: "联合营销", description: "共同开展内容、活动和患者教育。" },
      { title: "专属支持", description: "产品演示、适配指导和持续合作伙伴服务。" },
    ],
    ctaTitle: "准备好合作了吗？",
    ctaSubtitle: "联系我们预约产品演示，了解 Mpillow 如何支持您的业务。",
    ctaButtonLabel: "预约演示",
    ctaButtonUrl: "/partner/apply",
    showMarquee: true,
  },
};
