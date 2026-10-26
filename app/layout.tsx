import type { Metadata, Viewport } from "next";
import { Figtree } from "next/font/google";
import "./globals.css";
import { ThemeProvider } from "@/components/theme-provider";
import { CartProvider } from "@/lib/shop/cart-context";
import { CurrencyProvider } from "@/lib/shop/currency-context";
import { CartShell } from "@/components/shop/cart-shell";
import { AppDock } from "@/components/ui/app-dock";
import { HomeHeader } from "@/components/ui/home-header";
import { MarketingFooter } from "@/components/ui/marketing-footer";
import { SonnerProvider } from "@/components/ui/sonner-provider";
import { RouteScope } from "@/components/route-scope";
import { ApiRequestTracker } from "@/components/api-request-tracker";
import { JourneyTracker } from "@/components/analytics/journey-tracker";
import { AnalyticsNoticeBar } from "@/components/analytics/analytics-notice-bar";
import { TopLoadingBar } from "@/components/ui/top-loading-bar";
import { BookAppointmentOverlay } from "@/components/slide-in-pages/book-appointment-overlay";
import { SupportChatRoot } from "@/components/support/support-chat-root";
import { GoogleAnalytics } from "@/components/seo/google-analytics";
import { Haptics } from "@/components/haptics";
import { RegisterSW } from "@/components/register-sw";
import { SpeedInsights } from "@vercel/speed-insights/next";
import { cookies } from "next/headers";
import { DEFAULT_LOCALE, isSupportedLocale, LOCALE_COOKIE_NAME } from "@/lib/i18n/locales";
import { getSiteOrigin } from "@/lib/site-url";
import { DEFAULT_OG_IMAGE } from "@/lib/seo/metadata";

const figtree = Figtree({
  variable: "--font-figtree",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  metadataBase: new URL(getSiteOrigin()),
  title: {
    default: "Mpillow | Custom Pillow Singapore",
    template: "%s | Mpillow",
  },
  description:
    "Singapore's fully customisable cervical pillows and bolsters — fitted in-store for neck pain relief and ergonomic sleep.",
  applicationName: "Mpillow",
  // Pages without buildPageMetadata (FAQ, support, …) inherit this share image.
  openGraph: {
    type: "website",
    siteName: "Mpillow",
    images: [{ url: DEFAULT_OG_IMAGE, width: 1200, height: 630, alt: "Mpillow" }],
  },
  twitter: {
    card: "summary_large_image",
    images: [DEFAULT_OG_IMAGE],
  },
  manifest: "/manifest.webmanifest",
  icons: {
    icon: [{ url: "/icon-192.png" }],
    apple: [{ url: "/apple-touch-icon.png" }],
    shortcut: ["/icon-192.png"],
  },
  appleWebApp: {
    capable: true,
    title: "Mpillow",
    statusBarStyle: "black-translucent",
  },
  formatDetection: {
    telephone: false,
  },
  other: {
    "mobile-web-app-capable": "yes",
  },
  ...(process.env.NEXT_PUBLIC_GOOGLE_SITE_VERIFICATION
    ? { verification: { google: process.env.NEXT_PUBLIC_GOOGLE_SITE_VERIFICATION } }
    : {}),
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  // App-like PWA: lock pinch-zoom (intentional a11y tradeoff — see slice 13)
  maximumScale: 1,
  userScalable: false,
  viewportFit: "cover",
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#ffffff" },
    { media: "(prefers-color-scheme: dark)", color: "#0a0a0a" },
  ],
};

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const cookieStore = await cookies();
  const cookieLocale = cookieStore.get(LOCALE_COOKIE_NAME)?.value;
  const lang = isSupportedLocale(cookieLocale ?? "") ? cookieLocale : DEFAULT_LOCALE;
  const isProd = process.env.NODE_ENV === "production";

  return (
    <html lang={lang} suppressHydrationWarning>
      <body
        className={`${figtree.variable} antialiased`}
      >
        {isProd ? (
          <GoogleAnalytics
            gtmId={process.env.NEXT_PUBLIC_GTM_ID}
            gaMeasurementId={process.env.NEXT_PUBLIC_GA_MEASUREMENT_ID}
          />
        ) : null}
        <ThemeProvider
          attribute="class"
          defaultTheme="system"
          enableSystem
          disableTransitionOnChange
        >
          <Haptics />
          <RegisterSW />
          <ApiRequestTracker />
          <JourneyTracker />
          <AnalyticsNoticeBar />
          <TopLoadingBar />
          {/*
            One cart and one currency for the whole app. They live here, not in
            the shop layout, because the cart button sits in HomeHeader — and
            because a second nested CartProvider would be a second cart state
            racing the first over the same `mp_cart` localStorage key.
          */}
          <CurrencyProvider>
            <CartProvider>
              <HomeHeader />
              <RouteScope>{children}</RouteScope>
              <MarketingFooter />
              <BookAppointmentOverlay />
              <AppDock />
              <CartShell />
              {/* The website chat: up here so a chat started on /support follows the visitor between pages. */}
              <SupportChatRoot />
            </CartProvider>
          </CurrencyProvider>
          <SonnerProvider />
        </ThemeProvider>
        {isProd ? <SpeedInsights /> : null}
      </body>
    </html>
  );
}
