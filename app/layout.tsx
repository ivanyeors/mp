import type { Metadata, Viewport } from "next";
import { JetBrains_Mono, Sora } from "next/font/google";
import "./globals.css";
import { ThemeProvider } from "@/components/theme-provider";
import { AppDock } from "@/components/ui/app-dock";
import { MarketingFooter } from "@/components/ui/marketing-footer";
import { SonnerProvider } from "@/components/ui/sonner-provider";
import { RouteScope } from "@/components/route-scope";
import { ApiRequestTracker } from "@/components/api-request-tracker";
import { TopLoadingBar } from "@/components/ui/top-loading-bar";
import { BookAppointmentHost } from "@/components/slide-in-pages/book-appointment-sheet";
import { cookies } from "next/headers";
import { DEFAULT_LOCALE, isSupportedLocale, LOCALE_COOKIE_NAME } from "@/lib/i18n/locales";

const soraSans = Sora({
  variable: "--font-sora",
  subsets: ["latin"],
});

const soraMono = JetBrains_Mono({
  variable: "--font-sora-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Mpillow",
  description: "Mpillow",
  applicationName: "Mpillow",
  manifest: "/manifest.webmanifest",
  icons: {
    icon: [{ url: "/mpillow_logo_2026.png" }],
    apple: [{ url: "/mpillow_logo_2026.png" }],
    shortcut: ["/mpillow_logo_2026.png"],
  },
  appleWebApp: {
    capable: true,
    title: "Mpillow",
    statusBarStyle: "black-translucent",
  },
  formatDetection: {
    telephone: false,
  },
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#ffffff" },
    { media: "(prefers-color-scheme: dark)", color: "#0a0a0a" },
  ],
  other: {
    "mobile-web-app-capable": "yes",
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const cookieStore = await cookies();
  const cookieLocale = cookieStore.get(LOCALE_COOKIE_NAME)?.value;
  const lang = isSupportedLocale(cookieLocale ?? "") ? cookieLocale : DEFAULT_LOCALE;

  return (
    <html lang={lang} suppressHydrationWarning>
      <body
        className={`${soraSans.variable} ${soraMono.variable} antialiased`}
      >
        <ThemeProvider
          attribute="class"
          defaultTheme="system"
          enableSystem
          disableTransitionOnChange
        >
          <ApiRequestTracker />
          <TopLoadingBar />
          <RouteScope>{children}</RouteScope>
          <MarketingFooter />
          <BookAppointmentHost />
          <AppDock />
          <SonnerProvider />
        </ThemeProvider>
      </body>
    </html>
  );
}
