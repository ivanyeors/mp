import type { Metadata } from "next";
import type { ReactNode } from "react";
import { MpMakerPageTransition } from "./page-transition";

export const metadata: Metadata = {
  title: "Build your Mpillow",
  robots: { index: false, follow: true },
};

export default function MpMakerLayout({ children }: { children: ReactNode }) {
  return <MpMakerPageTransition>{children}</MpMakerPageTransition>;
}
