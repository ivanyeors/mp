"use client";

import Image from "next/image";
import { LOGO_SRC, LOGO_INV_SRC } from "@/lib/brand-logo";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Facebook, Instagram, Linkedin, Youtube } from "lucide-react";

import { FooterSignUp } from "@/components/auth/footer-sign-up";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { DEFAULT_LOCALE } from "@/lib/i18n/locales";
import { getLocaleFromPathname, stripLocale, withLocale } from "@/lib/i18n/routing";
import { isMarketingRoute } from "@/lib/routing/is-marketing-route";

const FOOTER_LINKS = [
  { label: "Our partners", href: "/our-partners" },
  { label: "Blog", href: "/blog" },
  // The guides are linked from one blog post each otherwise.
  { label: "Neck pain guide", href: "/guides/neck-pain" },
  { label: "Cervical pillow guide", href: "/guides/cervical-pillow" },
  { label: "Custom pillow guide", href: "/guides/custom-pillow" },
  { label: "Privacy policy", href: "/privacy-policy" },
  { label: "Returns & warranty", href: "/shipping-refund-policies" },
  { label: "Terms of service", href: "/terms-of-service" },
  { label: "Points", href: "/points" },
  { label: "Contact us", href: "/support" },
  { label: "FAQ", href: "/faq" },
] as const;

function TikTokIcon({ className }: { className?: string }) {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 24 24"
      className={className}
      fill="currentColor"
    >
      <path d="M20.027 10.168a5.125 5.125 0 0 1-4.76-2.294v7.893a5.833 5.833 0 1 1-5.834-5.834c.122 0 .241.011.361.019v2.874c-.12-.014-.237-.036-.36-.036a2.977 2.977 0 0 0 0 5.954c1.644 0 3.096-1.295 3.096-2.94L12.56 2.4h2.75a5.122 5.122 0 0 0 4.72 4.573v3.195" />
    </svg>
  );
}

const SOCIAL_LINKS = [
  {
    label: "Follow on Facebook",
    href: "https://www.facebook.com/thempillow",
    Icon: Facebook,
  },
  {
    label: "Follow on Instagram",
    href: "https://www.instagram.com/thempillow/",
    Icon: Instagram,
  },
  {
    label: "Follow on YouTube",
    href: "https://www.youtube.com/channel/UCgwq2h5BygQmCAXHRzLJHrQ",
    Icon: Youtube,
  },
  {
    label: "Follow on TikTok",
    href: "https://www.tiktok.com/@thempillow",
    Icon: TikTokIcon,
  },
  {
    label: "Follow on LinkedIn",
    href: "https://www.linkedin.com/company/mellowlife/",
    Icon: Linkedin,
  },
] as const;

export function MarketingFooter() {
  const pathname = usePathname() ?? "/";
  const basePathname = stripLocale(pathname);

  if (!isMarketingRoute(basePathname)) return null;

  const locale = getLocaleFromPathname(pathname) ?? DEFAULT_LOCALE;
  const to = (href: string) => withLocale(href, locale);
  const year = new Date().getFullYear();

  return (
    <footer className="w-full border-t border-border bg-muted/40 pb-[var(--mobile-bottom-clearance)] md:pb-0">
      <div className="mx-auto w-full max-w-6xl px-4 py-12 md:py-16">
        <div className="flex flex-col gap-8">
          <div className="flex flex-col gap-8 md:flex-row md:items-start md:justify-between">
            <div className="max-w-md space-y-5">
              <Link href={to("/")} className="inline-block">
                <Image
                  src={LOGO_SRC}
                  unoptimized
                  alt="Mpillow"
                  width={80}
                  height={80}
                  className="h-16 w-16 object-contain dark:hidden"
                />
                <Image
                  src={LOGO_INV_SRC}
                  unoptimized
                  alt="Mpillow"
                  width={80}
                  height={80}
                  className="hidden h-16 w-16 object-contain dark:block"
                />
              </Link>
              <ul className="flex flex-wrap gap-2" role="list">
                {SOCIAL_LINKS.map(({ label, href, Icon }) => (
                  <li key={href}>
                    <a
                      href={href}
                      target="_blank"
                      rel="noopener noreferrer"
                      aria-label={label}
                      className="inline-flex h-10 w-10 max-md:h-11 max-md:w-11 items-center justify-center rounded-full border border-border/60 text-muted-foreground transition-colors hover:border-foreground/30 hover:text-foreground"
                    >
                      <Icon className="h-5 w-5" />
                    </a>
                  </li>
                ))}
              </ul>
            </div>

            {/* The sign-up is the Customer sign-in (PRD-campaign-audiences slice 03). */}
            <div className="w-full md:max-w-sm">
              <FooterSignUp locale={locale} returnTo={pathname} />
            </div>
          </div>

          <nav aria-label="Footer" className="space-y-3">
            <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
              Footer menu
            </p>
            <ul className="flex flex-wrap gap-2" role="list">
              {FOOTER_LINKS.map(({ label, href }) => (
                <li key={href}>
                  <Button
                    asChild
                    variant="secondary"
                    className="h-11 w-fit rounded-full border-0 px-4 text-sm font-normal shadow-none"
                  >
                    <Link href={to(href)}>{label}</Link>
                  </Button>
                </li>
              ))}
            </ul>
          </nav>
        </div>

        <Separator className="my-8" />

        <p className="text-sm text-muted-foreground">
          &copy; {year} Mellow Life Pte Ltd. All rights reserved.
        </p>
      </div>
    </footer>
  );
}
