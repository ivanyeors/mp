import Link from "next/link";

import { DEFAULT_LOCALE, isSupportedLocale, type Locale } from "@/lib/i18n/locales";
import { withLocale } from "@/lib/i18n/routing";

const EFFECTIVE_DATE = "5 July 2026";

type PolicySection = {
  title: string;
  intro?: string[];
  list?: string[];
  outro?: string[];
};

const SECTIONS: PolicySection[] = [
  {
    title: "1. Who we are",
    intro: [
      "This Privacy Policy explains how Mellow Life Pte Ltd (\"Mpillow\", \"we\", \"us\", or \"our\") collects, uses, and protects personal data when you visit our website, shop for customisable pillows and sleep products, create an account, book an appointment, or contact us for support.",
      "Mpillow is a Singapore-based company that designs and sells customisable pillows and related sleep products. We are the data controller for personal data described in this policy.",
    ],
  },
  {
    title: "2. Who this policy applies to",
    intro: ["This policy applies if you:"],
    list: [
      "Browse our website or shop online",
      "Place an order as a guest or registered customer",
      "Create or use an Mpillow account",
      "Complete a pillow customisation, measurement, or configuration flow",
      "Book an appointment or request support",
      "Subscribe to updates or marketing communications where offered",
    ],
  },
  {
    title: "3. Personal data we collect",
    intro: ["Depending on how you interact with us, we may collect:"],
    list: [
      "Identity and contact details: name, email address, phone number",
      "Account details: login email, authentication method, and account preferences",
      "Order and transaction details: products purchased, customisation choices, order history, payment status, receipts, refunds, and delivery information",
      "Shipping and billing details: recipient name, address, city, state, postal code, country, and phone number",
      "Saved addresses linked to your account",
      "Support and communication content: messages you send through our contact form, email, WhatsApp, or other channels",
      "Customisation and sleep-related responses you provide when configuring a pillow or completing a measurement flow",
      "Technical and usage data: browser type, device information, pages viewed, and interactions with our site",
      "First-party visit analytics: an anonymous visitor identifier and the pages you view during a visit, so we can understand how people move through the site and improve the experience",
      "Cookie and cart data: identifiers needed to maintain your shopping cart and site preferences",
    ],
  },
  {
    title: "4. How we use your personal data",
    intro: ["We use personal data to:"],
    list: [
      "Process and fulfil orders, including payment, shipping, delivery, and after-sales support",
      "Provide account access, order history, saved addresses, and customisation tracking",
      "Operate pillow customisation, measurement, and appointment-related services",
      "Respond to enquiries, warranty claims, returns, and customer support requests",
      "Send transactional messages such as order confirmations, payment receipts, shipping updates, and refund notices",
      "Prevent fraud, protect our services, and maintain security",
      "Measure storefront visits (first-party visit analytics) and improve our website, products, and customer experience",
      "Comply with legal, tax, accounting, and regulatory obligations",
      "Send marketing communications only where permitted by law and, where required, with your consent. You may opt out at any time.",
    ],
  },
  {
    title: "5. Legal bases for processing",
    intro: [
      "Where applicable under Singapore's Personal Data Protection Act (PDPA) and other relevant laws, we process personal data based on one or more of the following:",
    ],
    list: [
      "Your consent, such as when you subscribe to marketing updates or submit optional information",
      "Performance of a contract, such as processing your order or providing account services",
      "Legitimate interests, such as improving our services, securing our platform, and preventing misuse, provided those interests are not overridden by your rights",
      "Legal obligations, such as record-keeping, tax, and compliance requirements",
    ],
  },
  {
    title: "6. How we share personal data",
    intro: [
      "We do not sell your personal data. We may share personal data with trusted service providers who help us operate our business, including:",
    ],
    list: [
      "Payment processors such as Stripe, to process payments, refunds, and tax where applicable",
      "Hosting, database, and authentication providers such as Supabase",
      "Inventory and commerce integrations such as Shopify, where used for product or order operations",
      "Email and messaging providers used to send transactional or support communications",
      "Delivery and logistics partners needed to ship your order",
      "Analytics, maps, or review providers where used to improve site functionality or display store information",
      "Professional advisers, insurers, or authorities where required by law or to protect our legal rights",
    ],
    outro: [
      "We require service providers to handle personal data only for the purposes we specify and to apply appropriate safeguards.",
    ],
  },
  {
    title: "7. Cookies and similar technologies",
    intro: [
      "We use cookies and similar technologies to keep our website working properly and to improve your experience.",
    ],
    list: [
      "Essential cookies: for example, an HTTP-only cart token cookie that remembers your shopping cart for up to 30 days",
      "Preference cookies: to remember settings such as language where applicable",
      "First-party visit analytics: a long-lived anonymous visitor cookie (and related browser storage) used to measure pages viewed and improve the site experience; this runs when you use the storefront",
      "Third-party analytics or marketing cookies: only if separately enabled on our site, and where required we will ask for your consent before using those non-essential cookies",
    ],
    outro: [
      "You can control cookies through your browser settings. Disabling essential cookies may affect cart persistence and checkout.",
    ],
  },
  {
    title: "8. How long we keep personal data",
    intro: [
      "We retain personal data only for as long as necessary for the purposes described in this policy, including:",
    ],
    list: [
      "Operating your account and fulfilling orders",
      "Providing warranty, returns, and customer support",
      "Meeting legal, tax, and accounting requirements",
      "Resolving disputes and enforcing our agreements",
      "Maintaining security logs and fraud-prevention records",
    ],
    outro: ["When data is no longer needed, we delete it or anonymise it where appropriate."],
  },
  {
    title: "9. Cross-border transfers",
    intro: [
      "Some of our service providers may process personal data outside Singapore. Where this occurs, we take reasonable steps to ensure that personal data receives a standard of protection comparable to that required under applicable law, including through contractual safeguards where appropriate.",
    ],
  },
  {
    title: "10. Security",
    intro: [
      "We implement reasonable administrative, technical, and organisational measures to protect personal data against unauthorised access, loss, misuse, or alteration. No online service can guarantee absolute security, but we work to safeguard the data you share with us.",
    ],
  },
  {
    title: "11. Your rights and choices",
    intro: ["Subject to applicable law, you may have the right to:"],
    list: [
      "Request access to the personal data we hold about you",
      "Request correction of inaccurate or incomplete personal data",
      "Withdraw consent where processing is based on consent",
      "Unsubscribe from marketing communications",
      "Request deletion of personal data, subject to legal and operational limits such as completed orders, tax records, warranty claims, or dispute resolution",
    ],
    outro: [
      "To exercise these rights, contact us using the details in Section 14. We may need to verify your identity before responding.",
    ],
  },
  {
    title: "12. Children",
    intro: [
      "Our website and services are not directed at children under 13. We do not knowingly collect personal data from children. If you believe a child has provided us with personal data, please contact us and we will take appropriate steps to delete it.",
    ],
  },
  {
    title: "13. Changes to this policy",
    intro: [
      "We may update this Privacy Policy from time to time to reflect changes in our practices, services, or legal requirements. The updated version will be posted on this page with a revised effective date. We encourage you to review this policy periodically.",
    ],
  },
  {
    title: "14. Contact us",
    intro: [
      "If you have questions about this Privacy Policy or wish to make a privacy request, contact us through our support page or the channels below:",
    ],
    list: [
      "Support form: use the Contact Us page on this website",
      "WhatsApp: +65 8780 5311",
    ],
    outro: ["Mellow Life Pte Ltd · Mpillow"],
  },
];

function PolicyParagraphs({ paragraphs }: { paragraphs: string[] }) {
  return paragraphs.map((paragraph) => (
    <p key={paragraph} className="leading-relaxed text-muted-foreground">
      {paragraph}
    </p>
  ));
}

function PolicySectionBlock({ section }: { section: PolicySection }) {
  return (
    <section className="space-y-3">
      <h2 className="text-lg font-semibold tracking-tight">{section.title}</h2>
      {section.intro ? <PolicyParagraphs paragraphs={section.intro} /> : null}
      {section.list ? (
        <ul className="list-disc space-y-1.5 pl-5 text-muted-foreground">
          {section.list.map((item) => (
            <li key={item} className="leading-relaxed">
              {item}
            </li>
          ))}
        </ul>
      ) : null}
      {section.outro ? <PolicyParagraphs paragraphs={section.outro} /> : null}
    </section>
  );
}

export default async function PrivacyPolicyPage({ params }: { params: Promise<{ lang: string }> }) {
  const { lang } = await params;
  const locale: Locale = isSupportedLocale(lang) ? lang : DEFAULT_LOCALE;
  const homeHref = withLocale("/", locale);
  const supportHref = withLocale("/support", locale);

  return (
    <main className="mx-auto w-full max-w-3xl px-4 py-12 md:py-16">
      <div className="space-y-3">
        <h1 className="text-3xl font-semibold tracking-tight md:text-4xl">Privacy Policy</h1>
        <p className="leading-relaxed text-muted-foreground">
          We care about protecting your data. This policy explains what personal data Mpillow collects,
          why we collect it, and how you can contact us about your privacy.
        </p>
        <p className="text-sm text-muted-foreground">Effective date: {EFFECTIVE_DATE}</p>
      </div>

      <div className="mt-10 space-y-8">
        {SECTIONS.map((section) => (
          <PolicySectionBlock key={section.title} section={section} />
        ))}
      </div>

      <div className="mt-10 space-y-2 border-t pt-6 text-sm text-muted-foreground">
        <p>
          Questions about your data?{" "}
          <Link href={supportHref} className="underline underline-offset-4">
            Contact support
          </Link>{" "}
          or WhatsApp{" "}
          <a
            className="underline underline-offset-4"
            href="http://wa.me/6587805311"
            target="_blank"
            rel="noopener noreferrer"
          >
            +65 8780 5311
          </a>
          .
        </p>
        <Link href={homeHref} className="inline-block underline underline-offset-4">
          Back to home
        </Link>
      </div>
    </main>
  );
}
