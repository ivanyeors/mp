import type { Metadata, Viewport } from "next";
import { JetBrains_Mono, Sora } from "next/font/google";
import "./globals.css";
import { ThemeProvider } from "@/components/theme-provider";
import { AppDock } from "@/components/app-dock";
import { SonnerProvider } from "@/components/sonner-provider";
import { RouteScope } from "@/components/route-scope";
import { ApiRequestTracker } from "@/components/api-request-tracker";
import { TopLoadingBar } from "@/components/top-loading-bar";

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

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
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
          <AppDock />
          <SonnerProvider />
        </ThemeProvider>
      </body>
    </html>
  );
}
