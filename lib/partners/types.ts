import type { Locale } from "@/lib/i18n/locales";

export type BenefitCard = {
  title: string;
  description: string;
};

export type WorkWithUsContent = {
  heroImage?: string;
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
  updated_at: string;
};

export type PartnerRow = {
  id: string;
  name: string;
  logo_url: string | null;
  website_url: string | null;
  description: string | null;
  position: number;
  visible: boolean;
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

export const DEFAULT_WORK_WITH_US: Record<Locale, WorkWithUsContent> = {
  "en-US": {
    title: "Collaborate with us",
    subtitle:
      "If you think Mpillow could add value to your patients and customers, reach out for a product demo.",
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
    ctaButtonUrl: "/support",
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
    ctaButtonUrl: "/support",
    showMarquee: true,
  },
};
