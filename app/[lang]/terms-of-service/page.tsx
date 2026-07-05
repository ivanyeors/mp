import Link from "next/link";

import { DEFAULT_LOCALE, isSupportedLocale, type Locale } from "@/lib/i18n/locales";
import { withLocale } from "@/lib/i18n/routing";

const LAST_UPDATED = "5 July 2026";

export default async function TermsOfServicePage({
  params,
}: {
  params: Promise<{ lang: string }>;
}) {
  const { lang } = await params;
  const locale: Locale = isSupportedLocale(lang) ? lang : DEFAULT_LOCALE;
  const homeHref = withLocale("/", locale);
  const policiesHref = withLocale("/shipping-refund-policies", locale);
  const privacyHref = withLocale("/privacy-policy", locale);

  return (
    <main className="mx-auto w-full max-w-3xl px-4 py-12 md:py-16">
      <div className="space-y-3">
        <h1 className="text-3xl font-semibold tracking-tight md:text-4xl">Terms of Service</h1>
        <p className="text-sm text-muted-foreground">Last updated: {LAST_UPDATED}</p>
        <p className="leading-relaxed text-muted-foreground">
          These Terms of Service (&ldquo;Terms&rdquo;) govern your access to and use of the Mpillow
          website, online store, appointment booking, and related services (collectively, the
          &ldquo;Services&rdquo;) operated by Mellow Life Pte Ltd (&ldquo;Mpillow&rdquo;,
          &ldquo;we&rdquo;, &ldquo;us&rdquo;, or &ldquo;our&rdquo;). By using our Services, you
          agree to these Terms.
        </p>
      </div>

      <div className="prose prose-neutral mt-10 max-w-none space-y-8 text-foreground dark:prose-invert">
        <section className="space-y-3">
          <h2 className="text-xl font-semibold tracking-tight">1. About Mpillow</h2>
          <p className="leading-relaxed text-muted-foreground">
            Mpillow designs and sells customisable ergonomic pillows and related sleep products. Our
            products are modular and adjustable, and may be configured based on your body build,
            sleep position, and comfort preferences. Some purchases may follow a consultation or
            appointment to help determine the right configuration for you.
          </p>
        </section>

        <section className="space-y-3">
          <h2 className="text-xl font-semibold tracking-tight">2. Eligibility</h2>
          <p className="leading-relaxed text-muted-foreground">
            You must be at least 18 years old, or have the consent of a parent or legal guardian, to
            use our Services and place orders. You agree to provide accurate and complete information
            when creating an account, booking an appointment, or completing a purchase.
          </p>
        </section>

        <section className="space-y-3">
          <h2 className="text-xl font-semibold tracking-tight">3. Products and Customisation</h2>
          <p className="leading-relaxed text-muted-foreground">
            Product descriptions, images, dimensions, and configuration options on our website are for
            general reference. Because Mpillow products are customisable, the final product you
            receive may differ in minor ways from illustrative materials while still meeting the
            specifications confirmed at checkout or during your consultation.
          </p>
          <p className="leading-relaxed text-muted-foreground">
            We may update product designs, materials, modular components, or packaging from time to
            time. Where a change materially affects an order you have already placed, we will contact
            you before fulfilment.
          </p>
        </section>

        <section className="space-y-3">
          <h2 className="text-xl font-semibold tracking-tight">4. Appointments and Consultations</h2>
          <p className="leading-relaxed text-muted-foreground">
            If you book an appointment or consultation, you agree to provide truthful information
            about your sleep habits, comfort needs, and any relevant health concerns. Appointments are
            subject to availability and may be rescheduled or cancelled in accordance with the
            instructions provided at booking.
          </p>
          <p className="leading-relaxed text-muted-foreground">
            Recommendations made during a consultation are intended to help you select a suitable
            pillow configuration. They do not replace professional medical assessment or treatment.
          </p>
        </section>

        <section className="space-y-3">
          <h2 className="text-xl font-semibold tracking-tight">5. Orders and Accounts</h2>
          <p className="leading-relaxed text-muted-foreground">
            When you place an order, you offer to purchase the selected products on these Terms. We
            may accept or decline an order at our discretion, including where items are unavailable,
            pricing errors occur, or we suspect fraud or unauthorised activity.
          </p>
          <p className="leading-relaxed text-muted-foreground">
            You are responsible for maintaining the confidentiality of your account credentials and
            for all activity under your account. Please notify us promptly if you believe your
            account has been compromised.
          </p>
        </section>

        <section className="space-y-3">
          <h2 className="text-xl font-semibold tracking-tight">6. Pricing and Payment</h2>
          <p className="leading-relaxed text-muted-foreground">
            Prices are shown in Singapore Dollars unless stated otherwise and may change without
            notice. Applicable taxes, shipping fees, and promotions will be displayed before you
            confirm payment. We reserve the right to correct pricing mistakes and to cancel orders
            affected by such mistakes.
          </p>
          <p className="leading-relaxed text-muted-foreground">
            Payment must be completed through the payment methods made available on our platform at
            checkout. An order is confirmed only after we have accepted it and received successful
            payment, unless otherwise stated.
          </p>
        </section>

        <section className="space-y-3">
          <h2 className="text-xl font-semibold tracking-tight">7. Delivery</h2>
          <p className="leading-relaxed text-muted-foreground">
            Delivery timelines are estimates only and may vary due to product customisation,
            inventory, courier schedules, or events outside our control. Risk of loss passes to you
            upon delivery to the address you provide, or upon collection if you choose
            self-collection where offered.
          </p>
          <p className="leading-relaxed text-muted-foreground">
            You are responsible for providing a correct and accessible delivery address. We are not
            liable for delays or failed deliveries caused by incorrect details, refusal of delivery,
            or circumstances beyond our reasonable control.
          </p>
        </section>

        <section className="space-y-3">
          <h2 className="text-xl font-semibold tracking-tight">8. Returns, Refunds, and Exchanges</h2>
          <p className="leading-relaxed text-muted-foreground">
            Returns, refunds, exchanges, and warranty-related matters are governed by our{" "}
            <Link href={policiesHref} className="underline underline-offset-4">
              Returns &amp; Warranty
            </Link>
            , which are incorporated into these Terms by reference. Customised or personalised
            products may be subject to additional restrictions.
          </p>
        </section>

        <section className="space-y-3">
          <h2 className="text-xl font-semibold tracking-tight">9. Product Care</h2>
          <p className="leading-relaxed text-muted-foreground">
            Mpillow products include washable modular components. You agree to follow the care
            instructions provided with your product or on our website. Improper washing, modification,
            or use outside the intended purpose may affect product performance, hygiene, and
            eligibility for support or warranty claims.
          </p>
        </section>

        <section className="space-y-3">
          <h2 className="text-xl font-semibold tracking-tight">10. Health and Wellness Disclaimer</h2>
          <p className="leading-relaxed text-muted-foreground">
            Mpillow products and content are designed to support comfort and sleep posture. They are
            not medical devices and are not intended to diagnose, treat, cure, or prevent any disease
            or medical condition, including neck pain, spinal disorders, or sleep disorders.
          </p>
          <p className="leading-relaxed text-muted-foreground">
            Information on our website, in consultations, or in marketing materials is provided for
            general educational purposes only and does not constitute medical advice. Always consult a
            qualified healthcare professional regarding persistent pain, injury, or health concerns
            before relying on any sleep product.
          </p>
        </section>

        <section className="space-y-3">
          <h2 className="text-xl font-semibold tracking-tight">11. Intellectual Property</h2>
          <p className="leading-relaxed text-muted-foreground">
            All content on our Services — including text, images, logos, product designs, videos, and
            software — is owned by or licensed to Mellow Life Pte Ltd and protected by applicable
            intellectual property laws. You may not copy, reproduce, distribute, modify, or exploit
            our content without our prior written consent.
          </p>
        </section>

        <section className="space-y-3">
          <h2 className="text-xl font-semibold tracking-tight">12. Acceptable Use</h2>
          <p className="leading-relaxed text-muted-foreground">
            You agree not to misuse our Services. This includes attempting to gain unauthorised
            access, interfering with site operation, scraping content without permission, posting
            unlawful or misleading material, or using our Services in a way that harms Mpillow,
            other customers, or third parties.
          </p>
        </section>

        <section className="space-y-3">
          <h2 className="text-xl font-semibold tracking-tight">13. Disclaimer of Warranties</h2>
          <p className="leading-relaxed text-muted-foreground">
            To the fullest extent permitted by law, our Services and products are provided on an
            &ldquo;as is&rdquo; and &ldquo;as available&rdquo; basis, except where mandatory
            consumer rights apply. We do not warrant that the Services will be uninterrupted,
            error-free, or meet every individual expectation of comfort or sleep improvement.
          </p>
        </section>

        <section className="space-y-3">
          <h2 className="text-xl font-semibold tracking-tight">14. Limitation of Liability</h2>
          <p className="leading-relaxed text-muted-foreground">
            To the fullest extent permitted by Singapore law, Mellow Life Pte Ltd will not be liable
            for any indirect, incidental, special, consequential, or punitive damages, or for loss of
            profits, data, or goodwill, arising from your use of our Services or products.
          </p>
          <p className="leading-relaxed text-muted-foreground">
            Our total liability for any claim relating to a product or the Services will not exceed
            the amount you paid for the relevant order, except where liability cannot be limited
            under applicable law.
          </p>
        </section>

        <section className="space-y-3">
          <h2 className="text-xl font-semibold tracking-tight">15. Indemnity</h2>
          <p className="leading-relaxed text-muted-foreground">
            You agree to indemnify and hold harmless Mellow Life Pte Ltd, its directors, employees,
            and agents from claims, losses, and expenses arising out of your breach of these Terms,
            misuse of the Services, or violation of any law or third-party rights.
          </p>
        </section>

        <section className="space-y-3">
          <h2 className="text-xl font-semibold tracking-tight">16. Privacy</h2>
          <p className="leading-relaxed text-muted-foreground">
            Our collection and use of personal data is described in our{" "}
            <Link href={privacyHref} className="underline underline-offset-4">
              Privacy Policy
            </Link>
            . By using the Services, you acknowledge that you have read and understood how we handle
            personal data.
          </p>
        </section>

        <section className="space-y-3">
          <h2 className="text-xl font-semibold tracking-tight">17. Changes to These Terms</h2>
          <p className="leading-relaxed text-muted-foreground">
            We may update these Terms from time to time. The &ldquo;Last updated&rdquo; date at the
            top of this page indicates when the latest version was published. Continued use of the
            Services after changes take effect constitutes acceptance of the revised Terms.
          </p>
        </section>

        <section className="space-y-3">
          <h2 className="text-xl font-semibold tracking-tight">18. Governing Law and Disputes</h2>
          <p className="leading-relaxed text-muted-foreground">
            These Terms are governed by the laws of Singapore. Any dispute arising out of or in
            connection with these Terms or the Services shall be subject to the exclusive
            jurisdiction of the courts of Singapore, without prejudice to any mandatory consumer
            rights you may have.
          </p>
        </section>

        <section className="space-y-3">
          <h2 className="text-xl font-semibold tracking-tight">19. Contact Us</h2>
          <p className="leading-relaxed text-muted-foreground">
            If you have questions about these Terms, please contact us at{" "}
            <a href="mailto:sg@mpillow.com" className="underline underline-offset-4">
              sg@mpillow.com
            </a>
            .
          </p>
        </section>
      </div>

      <div className="mt-10 border-t pt-6">
        <Link href={homeHref} className="text-sm underline underline-offset-4">
          Back to home
        </Link>
      </div>
    </main>
  );
}
