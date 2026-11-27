// ponytail: iPhones in portrait only (the manifest locks portrait). An iPad, or an iPhone
// whose screen is not listed, still opens on a blank screen; add its size here to cover it.
const IPHONE_SCREENS = [
  { width: 375, height: 667, ratio: 2 },
  { width: 414, height: 736, ratio: 3 },
  { width: 375, height: 812, ratio: 3 },
  { width: 414, height: 896, ratio: 2 },
  { width: 414, height: 896, ratio: 3 },
  { width: 390, height: 844, ratio: 3 },
  { width: 428, height: 926, ratio: 3 },
  { width: 393, height: 852, ratio: 3 },
  { width: 430, height: 932, ratio: 3 },
  { width: 402, height: 874, ratio: 3 },
  { width: 440, height: 956, ratio: 3 },
  { width: 420, height: 912, ratio: 3 },
] as const;

export const APPLE_SPLASH_BACKGROUND = { light: "#ffffff", dark: "#0a0a0a" } as const;

export type AppleSplashScheme = keyof typeof APPLE_SPLASH_BACKGROUND;

export type AppleSplashImage = {
  file: string;
  url: string;
  media: string;
  widthPx: number;
  heightPx: number;
  ratio: number;
  scheme: AppleSplashScheme;
};

const SCHEMES: AppleSplashScheme[] = ["light", "dark"];

export const APPLE_SPLASH_IMAGES: AppleSplashImage[] = IPHONE_SCREENS.flatMap(({ width, height, ratio }) =>
  SCHEMES.map((scheme) => {
    const file = `${width * ratio}x${height * ratio}-${scheme}.png`;
    return {
      file,
      url: `/apple-splash/${file}`,
      media: `(device-width: ${width}px) and (device-height: ${height}px) and (-webkit-device-pixel-ratio: ${ratio}) and (orientation: portrait) and (prefers-color-scheme: ${scheme})`,
      widthPx: width * ratio,
      heightPx: height * ratio,
      ratio,
      scheme,
    };
  }),
);
