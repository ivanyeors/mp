import type { Metadata } from "next";
import type { ReactNode } from "react";
import { MpMakerPageTransition } from "./page-transition";

/**
 * The legacy builder, superseded by /mp-config and /mbolster-config: nothing
 * links here and the sitemap leaves it out, so it stays out of search.
 */
export const metadata: Metadata = {
  title: "Build your Mpillow",
  robots: { index: false, follow: true },
};

export default function MpMakerLayout({ children }: { children: ReactNode }) {
  return <MpMakerPageTransition>{children}</MpMakerPageTransition>;
}
