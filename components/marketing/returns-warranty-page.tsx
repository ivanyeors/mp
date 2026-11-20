import Link from "next/link";
import {
  ArrowLeftRight,
  Ban,
  Clock,
  Package,
  RefreshCw,
  Shield,
  Truck,
} from "lucide-react";

import { OpenChatButton } from "@/components/support/open-chat-button";
import { Badge } from "@/components/ui/badge";
import { DeliveryEstimator } from "@/components/shop/delivery-estimator";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { DEFAULT_LOCALE, isSupportedLocale, type Locale } from "@/lib/i18n/locales";
import { withLocale } from "@/lib/i18n/routing";
import { interpolateServiceCopyDeep, loadServiceCopyValues } from "@/lib/pricing/service-copy";
import { supabaseAdmin } from "@/lib/supabase/server";

const LAST_UPDATED = "5 July 2026";

type ProductWarranty = {
  id: string;
  name: string;
  tagline: string;
  fillingsWarranty: string;
  refundPolicy: string;
  adjustmentPolicy: string;
  highlights: string[];
};

const PRODUCT_WARRANTIES: ProductWarranty[] = [
  {
    id: "basic",
    name: "Basic Mpillow",
    tagline: "Ergonomic support with modular care",
    fillingsWarranty: "No long-term fillings warranty",
    refundPolicy: "No refunds",
    adjustmentPolicy: "{readjustmentFee} per adjustment at our service centre",
    highlights: [
      "30-day fit support window for size exchanges (see Exchange policy)",
      "Upgrade to Premium Mpillow available via in-person verification",
      "Bring your pillow in its original vacuum and laundry bags",
    ],
  },
  {
    id: "premium",
    name: "Premium Mpillow",
    tagline: "Fully customised to your measurements",
    fillingsWarranty: "10-year fillings warranty",
    refundPolicy: "No refunds",
    adjustmentPolicy: "1 free adjustment within {freeWindowDays} days, then {readjustmentFee} per visit",
    highlights: [
      "Complimentary stuffing during re-adjustments (accessories excluded)",
      "Sign in when you book — your order is your proof of purchase",
      "Within the 10-year warranty: {readjustmentFee} per adjustment, including filling changes",
    ],
  },
  {
    id: "mbolster",
    name: "Mbolster",
    tagline: "Modular, washable bolster for side sleepers",
    fillingsWarranty: "10-year fillings warranty",
    refundPolicy: "No refunds",
    adjustmentPolicy: "{readjustmentFee} per re-adjustment at our service centre",
    highlights: [
      "Same modular fillings technology as Mpillow",
      "100% washable components for long-term hygiene",
      "Size exchanges follow the same 2-week in-person policy",
    ],
  },
];

const QUICK_LINKS = [
  { href: "#warranty-overview", label: "Warranty overview" },
  { href: "#shipping", label: "Shipping" },
  { href: "#refunds", label: "Refunds" },
  { href: "#cancellation", label: "Cancellation" },
  { href: "#exchange", label: "Exchange" },
  { href: "#adjustments", label: "Adjustments" },
  { href: "#accessories", label: "Accessories" },
  { href: "#contact", label: "Contact" },
] as const;

type ReturnsWarrantyPageProps = {
  params: Promise<{ lang: string }>;
};

export async function ReturnsWarrantyPage({ params }: ReturnsWarrantyPageProps) {
  const { lang } = await params;
  const locale: Locale = isSupportedLocale(lang) ? lang : DEFAULT_LOCALE;
  const homeHref = withLocale("/", locale);
  const supportHref = withLocale("/support", locale);
  const mpCareHref = withLocale("/mp-care", locale);
  const readjustHref = withLocale("/appointments?type=readjustment", locale);
  const copy = await loadServiceCopyValues(supabaseAdmin());
  const products = PRODUCT_WARRANTIES.map((p) => interpolateServiceCopyDeep(p, copy));

  return (
    <main className="mx-auto w-full max-w-7xl px-4 py-12 sm:px-6 md:py-16 lg:px-8">
      <div className="space-y-4">
        <h1 className="text-3xl font-semibold tracking-tight md:text-4xl">Returns &amp; Warranty</h1>
        <p className="text-sm text-muted-foreground">Last updated: {LAST_UPDATED}</p>
        <p className="w-full leading-relaxed text-muted-foreground">
          Everything you need to know about shipping timelines, returns, exchanges, adjustments, and
          product warranties for Basic Mpillow, Premium Mpillow, and Mbolster.
        </p>
      </div>

      <nav
        aria-label="Policy sections"
        className="mt-8 flex flex-wrap gap-2"
      >
        {QUICK_LINKS.map((link) => (
          <a
            key={link.href}
            href={link.href}
            className="shrink-0 rounded-full border bg-background px-3 py-1.5 text-sm text-muted-foreground transition-colors hover:border-foreground/20 hover:text-foreground"
          >
            {link.label}
          </a>
        ))}
      </nav>

      <section id="warranty-overview" className="mt-10 scroll-mt-24 space-y-4">
        <div className="space-y-2">
          <h2 className="text-xl font-semibold tracking-tight">Product warranty at a glance</h2>
          <p className="text-sm leading-relaxed text-muted-foreground">
            Compare coverage across our core products. Detailed policy terms follow in the sections
            below.
          </p>
        </div>

        <div className="grid w-full grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {products.map((product) => (
            <Card key={product.id} id={product.id} className="flex h-full w-full scroll-mt-24 flex-col gap-4 py-5">
              <CardHeader className="gap-3 px-5">
                <div className="flex items-start justify-between gap-2">
                  <CardTitle className="text-base">{product.name}</CardTitle>
                  <Shield className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
                </div>
                <CardDescription>{product.tagline}</CardDescription>
              </CardHeader>
              <CardContent className="flex flex-1 flex-col space-y-4 px-5">
                <div className="space-y-2">
                  <div className="flex flex-wrap gap-2">
                    <Badge variant="secondary">{product.fillingsWarranty}</Badge>
                    <Badge variant="outline">{product.refundPolicy}</Badge>
                  </div>
                  <p className="text-sm text-muted-foreground">{product.adjustmentPolicy}</p>
                </div>
                <ul className="space-y-2 text-sm leading-relaxed text-muted-foreground">
                  {product.highlights.map((item) => (
                    <li key={item} className="flex gap-2">
                      <span className="mt-2 size-1 shrink-0 rounded-full bg-foreground/40" />
                      <span>{item}</span>
                    </li>
                  ))}
                </ul>
              </CardContent>
            </Card>
          ))}
        </div>
      </section>

      <Separator className="my-10" />

      <div className="space-y-10 text-foreground">
        <section id="shipping" className="scroll-mt-24 space-y-4">
          <div className="flex items-center gap-2">
            <Truck className="size-5 text-muted-foreground" aria-hidden="true" />
            <h2 className="text-xl font-semibold tracking-tight">Shipping policy</h2>
          </div>
          <ul className="space-y-2 text-sm leading-relaxed text-muted-foreground">
            <li>
              Orders are processed within <strong className="text-foreground">3 to 5 business days</strong>{" "}
              (excluding weekends and public holidays) after your order confirmation email.
            </li>
            <li>
              If you need us to configure your pillow more accurately, please check your order against
              the measurement form you submitted.
            </li>
            <li>
              You will receive a notification with a tracking number once your shipment is on the way.
            </li>
            <li>
              Customised and configured Mpillows require an <strong className="text-foreground">extra day</strong>{" "}
              for fulfilment.
            </li>
            <li>You will receive another notification when your order has shipped.</li>
            <li>
              We ship from Singapore through our courier partners to every country in the delivery
              checker below. Delivery rates depend on your address and are shown at checkout — or
              check yours below.
            </li>
          </ul>
          <div className="max-w-xl rounded-xl border p-4 md:p-5">
            <DeliveryEstimator locale={locale} profile="pillow" />
          </div>
        </section>

        <section id="refunds" className="scroll-mt-24 space-y-4">
          <div className="flex items-center gap-2">
            <Ban className="size-5 text-muted-foreground" aria-hidden="true" />
            <h2 className="text-xl font-semibold tracking-tight">Refund policy</h2>
          </div>
          <p className="text-sm leading-relaxed text-muted-foreground">
            Because our pillows and bolsters are personal sleep products, refund eligibility differs by
            product line.
          </p>

          <div className="grid w-full grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
            <Card className="flex h-full w-full flex-col gap-3 py-5">
              <CardHeader className="px-5">
                <CardTitle className="text-base">Basic Mpillow</CardTitle>
              </CardHeader>
              <CardContent className="flex flex-1 flex-col space-y-3 px-5 text-sm leading-relaxed text-muted-foreground">
                <p>
                  We <strong className="text-foreground">do not accept refunds</strong> for Basic
                  Mpillow due to hygiene reasons.
                </p>
                <p>
                  To upgrade to a customisable Premium Mpillow, schedule an appointment via our{" "}
                  <Link href={supportHref} className="underline underline-offset-4">
                    Contact Us
                  </Link>{" "}
                  page and bring your pillow in its original vacuum bag and laundry bag to our service
                  centre for verification.
                </p>
              </CardContent>
            </Card>

            <Card className="flex h-full w-full flex-col gap-3 py-5">
              <CardHeader className="px-5">
                <CardTitle className="text-base">Premium Mpillow</CardTitle>
              </CardHeader>
              <CardContent className="flex flex-1 flex-col space-y-3 px-5 text-sm leading-relaxed text-muted-foreground">
                <p>
                  Due to the customisation of Premium Mpillow, we{" "}
                  <strong className="text-foreground">do not accept refunds</strong>.
                </p>
                <p>
                  We are committed to helping you sleep well. If your experience is not satisfactory,
                  reach out and we will work with you on adjustments or other support options.
                </p>
              </CardContent>
            </Card>

            <Card className="flex h-full w-full flex-col gap-3 py-5">
              <CardHeader className="px-5">
                <CardTitle className="text-base">Mbolster</CardTitle>
              </CardHeader>
              <CardContent className="flex flex-1 flex-col space-y-3 px-5 text-sm leading-relaxed text-muted-foreground">
                <p>
                  Mbolster is a customised, washable sleep product. We{" "}
                  <strong className="text-foreground">do not accept refunds</strong> for hygiene and
                  customisation reasons.
                </p>
                <p>
                  Firmness and fit concerns can be addressed through an in-person adjustment
                  appointment at our service centre.
                </p>
              </CardContent>
            </Card>
          </div>

          <p className="text-sm leading-relaxed text-muted-foreground">
            For refund-related questions, <OpenChatButton>chat with us</OpenChatButton> or email{" "}
            <a href="mailto:sleep@mpillow.com" className="underline underline-offset-4">
              sleep@mpillow.com
            </a>
            .
          </p>
        </section>

        <section id="cancellation" className="scroll-mt-24 space-y-4">
          <div className="flex items-center gap-2">
            <Clock className="size-5 text-muted-foreground" aria-hidden="true" />
            <h2 className="text-xl font-semibold tracking-tight">Cancellation policy</h2>
          </div>
          <ul className="space-y-2 text-sm leading-relaxed text-muted-foreground">
            <li>
              Cancellation applies only <strong className="text-foreground">before</strong> a tracking
              code is sent to you.
            </li>
            <li>
              You may cancel immediately after purchase at any point before the tracking code is issued.
            </li>
            <li>
              Once you have received a tracking code, the order can no longer be cancelled. Please
              contact us if you need help with delivery issues.
            </li>
          </ul>
        </section>

        <section id="exchange" className="scroll-mt-24 space-y-4">
          <div className="flex items-center gap-2">
            <ArrowLeftRight className="size-5 text-muted-foreground" aria-hidden="true" />
            <h2 className="text-xl font-semibold tracking-tight">Exchange policy</h2>
          </div>
          <p className="text-sm leading-relaxed text-muted-foreground">
            If your pillow size is unsuitable, our exchange policy applies within{" "}
            <strong className="text-foreground">2 weeks</strong> of your order.
          </p>
          <ul className="space-y-2 text-sm leading-relaxed text-muted-foreground">
            <li>
              Exchanges must be done <strong className="text-foreground">in person</strong> at our
              office. Delivery is not available for exchanges so we can remeasure, configure your
              optimal posture, and complete a one-to-one exchange at no additional service cost.
            </li>
            <li>
              If you purchased a pillow size <strong className="text-foreground">larger</strong> than
              your measurements, we do not refund the size price difference. We may include extra cases
              or covers based on the amount difference instead.
            </li>
            <li>
              If your pillow size is <strong className="text-foreground">smaller</strong> than your
              measured size, you are required to top up the product price difference (for example,
              upgrading from a (S) Mpillow to a (M) Mpillow linen case).
            </li>
            <li>
              Please pack your product in the original packaging where possible. If the box is
              unavailable, pack it in the dry bag with the pillow vacuum-sealed properly to help our
              exchange process.
            </li>
            <li>We do not collect products for refunds or exchanges — please visit us in person.</li>
          </ul>
          <p className="text-sm leading-relaxed text-muted-foreground">
            For exchange enquiries, contact us at{" "}
            <a href="mailto:sleep@mpillow.com" className="underline underline-offset-4">
              sleep@mpillow.com
            </a>
            .
          </p>
        </section>

        <section id="adjustments" className="scroll-mt-24 space-y-4">
          <div className="flex items-center gap-2">
            <RefreshCw className="size-5 text-muted-foreground" aria-hidden="true" />
            <h2 className="text-xl font-semibold tracking-tight">Adjustment policy</h2>
          </div>

          <div className="space-y-6">
            <div className="space-y-3">
              <h3 className="text-base font-semibold">Premium Mpillow</h3>
              <ul className="space-y-2 text-sm leading-relaxed text-muted-foreground">
                <li>
                  <strong className="text-foreground">One free adjustment</strong> within{" "}
                  {copy.freeWindowDays} days of purchase.
                </li>
                <li>
                  <Link href={readjustHref} className="underline underline-offset-4">
                    Sign in and pick your pillow when you book
                  </Link>{" "}
                  — your order is your proof of purchase. Bought before accounts existed, in store or
                  as a gift? Book anyway and bring proof of purchase to the visit.
                </li>
                <li>
                  After the complimentary visit, or for additional adjustments: {copy.readjustmentFee}{" "}
                  per adjustment.
                </li>
                <li>
                  Within the 10-year Premium Mpillow warranty, adjustments cost {copy.readjustmentFee}{" "}
                  per visit, including filling changes. Stuffing is provided at no extra charge during
                  re-adjustments (accessories and other components excluded).
                </li>
              </ul>
            </div>

            <div className="space-y-3">
              <h3 className="text-base font-semibold">Basic Mpillow</h3>
              <p className="text-sm leading-relaxed text-muted-foreground">
                Basic Mpillow adjustments are available at our service centre for{" "}
                <strong className="text-foreground">{copy.readjustmentFee} per session</strong>.{" "}
                <Link href={readjustHref} className="underline underline-offset-4">
                  Book a re-adjustment
                </Link>{" "}
                or{" "}
                <Link href={supportHref} className="underline underline-offset-4">
                  contact us
                </Link>{" "}
                if you need help with fit or maintenance.
              </p>
            </div>

            <div className="space-y-3">
              <h3 className="text-base font-semibold">Mbolster</h3>
              <p className="text-sm leading-relaxed text-muted-foreground">
                Mbolster firmness can be adjusted using the same modular fillings as Mpillow, for{" "}
                <strong className="text-foreground">{copy.readjustmentFee} per re-adjustment</strong>.{" "}
                <Link href={readjustHref} className="underline underline-offset-4">
                  Book a re-adjustment
                </Link>{" "}
                and we will help you tune firmness for your side-sleeping preference.
              </p>
            </div>
          </div>
        </section>

        <section id="accessories" className="scroll-mt-24 space-y-4">
          <div className="flex items-center gap-2">
            <Package className="size-5 text-muted-foreground" aria-hidden="true" />
            <h2 className="text-xl font-semibold tracking-tight">Covers, cases &amp; protectors</h2>
          </div>
          <p className="text-sm leading-relaxed text-muted-foreground">
            Mpillow covers, cases, and inner protectors carry a{" "}
            <strong className="text-foreground">one-week manufacturer defect warranty</strong> from
            the date you receive the product. This covers manufacturing defects only — not wear from
            normal use or improper care.
          </p>
          <p className="text-sm leading-relaxed text-muted-foreground">
            For fillings that compress over time, see our{" "}
            <Link href={mpCareHref} className="underline underline-offset-4">
              Mpillow Care
            </Link>{" "}
            guide on fluffing and maintenance before requesting a warranty adjustment.
          </p>
        </section>

        <section
          id="contact"
          className="scroll-mt-24 rounded-xl border bg-muted/30 px-5 py-6 md:px-6"
        >
          <h2 className="text-xl font-semibold tracking-tight">Need help?</h2>
          <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
            We want every customer to wake up rested. If something is not right with your order,
            pillow fit, or warranty claim, reach out and we will do our best to help.
          </p>
          <ul className="mt-4 space-y-2 text-sm leading-relaxed text-muted-foreground">
            <li>
              Email:{" "}
              <a href="mailto:sleep@mpillow.com" className="underline underline-offset-4">
                sleep@mpillow.com
              </a>
            </li>
            <li>
              <OpenChatButton>Chat with us</OpenChatButton>
            </li>
            <li>
              <Link href={supportHref} className="underline underline-offset-4">
                Contact Us
              </Link>{" "}
              — book an appointment or send a message
            </li>
          </ul>
          <p className="mt-4 text-sm italic text-muted-foreground">
            Today&apos;s Sleep is for Tomorrow&apos;s Headstart!
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
