import type { Metadata } from "next";

import { ExploreExperience } from "@/components/explore/explore-experience";
import { LoadingUntilReady } from "@/components/mpillow-loading";
import { getAuthUser } from "@/lib/auth/user";
import { EXPLORE_LAUNCH_AT } from "@/lib/explore/launch";
import { skyAt } from "@/lib/explore/sky";
import { NO_FLOWERS, readExploreFlowers, readExploreViewer } from "@/lib/explore/viewer";
import { DEFAULT_LOCALE, isSupportedLocale, type Locale } from "@/lib/i18n/locales";
import { getMessages } from "@/lib/i18n/messages";
import { readPointsSettings } from "@/lib/points/server";
import { POINTS_DEFAULTS, pointsLive } from "@/lib/points/settings";
import { readWelcomeSteps, welcomeOffer } from "@/lib/points/welcome";
import { englishOnlyPageMetadata } from "@/lib/seo/page-meta";
import { getCurrentCustomerId } from "@/lib/shop/customer-addresses";
import { supabaseAdmin } from "@/lib/supabase/server";

export async function generateMetadata({ params }: { params: Promise<{ lang: string }> }): Promise<Metadata> {
  return englishOnlyPageMetadata("explore", (await params).lang);
}

const SINGAPORE = { lat: 1.35, lon: 103.82 };

type ExplorePageProps = {
  params: Promise<{ lang: string }>;
  searchParams: Promise<{ claim?: string; flower?: string; hour?: string; rain?: string; bloom?: string; launched?: string }>;
};

export default async function ExplorePage(props: ExplorePageProps) {
  const { lang } = await props.params;
  const locale: Locale = isSupportedLocale(lang) ? lang : DEFAULT_LOCALE;

  return (
    <LoadingUntilReady label={getMessages(locale).common.loading}>
      <Explore {...props} />
    </LoadingUntilReady>
  );
}

async function Explore({ params, searchParams }: ExplorePageProps) {
  const { lang } = await params;
  const { claim, flower, hour, rain, bloom, launched } = await searchParams;
  const locale: Locale = isSupportedLocale(lang) ? lang : DEFAULT_LOCALE;
  const admin = supabaseAdmin();

  const [settings, user] = await Promise.all([readPointsSettings(admin).catch(() => POINTS_DEFAULTS), getAuthUser()]);
  const offer = settings.enabled ? welcomeOffer(await readWelcomeSteps(admin).catch(() => [])) : null;
  const customerId = user ? await getCurrentCustomerId() : null;
  const [viewer, flowers] = await Promise.all([
    customerId ? readExploreViewer(admin, customerId, Boolean(offer?.current)).catch(() => null) : null,
    readExploreFlowers(admin, customerId).catch(() => NO_FLOWERS),
  ]);

  const hourValue = hour != null && hour !== "" ? Number(hour) : NaN;
  const bloomValue = process.env.NODE_ENV !== "production" && bloom ? Math.floor(Number(bloom)) : NaN;
  const now = new Date();
  const flowerValue = flower != null && /^[0-4]$/.test(flower) ? Number(flower) : null;

  return (
    <ExploreExperience
      locale={locale}
      serverNow={now.getTime()}
      launchAt={process.env.NODE_ENV !== "production" && launched === "1" ? now.getTime() - 1000 : Date.parse(EXPLORE_LAUNCH_AT)}
      initialSky={skyAt(now, SINGAPORE)}
      offer={offer}
      pointsOn={settings.enabled}
      pointsLive={pointsLive(settings, now)}
      rules={{ minRedeem: settings.minRedeem, maxShare: settings.maxShare }}
      signedIn={Boolean(user)}
      viewer={viewer}
      flowers={bloomValue >= 1 && bloomValue <= 5 ? { count: bloomValue, picked: [], givesPoints: false } : flowers}
      finishClaim={claim === "1" && Boolean(user)}
      finishFlower={user ? flowerValue : null}
      look={{
        hour: Number.isFinite(hourValue) && hourValue >= 0 && hourValue <= 24 ? hourValue : null,
        rain: rain === "1" ? true : rain === "0" ? false : null,
      }}
    />
  );
}
