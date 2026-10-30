import type { Metadata } from "next";
import { englishOnlyPageMetadata } from "@/lib/seo/page-meta";
import { ReturnsWarrantyPage } from "@/components/marketing/returns-warranty-page";

export async function generateMetadata({ params }: { params: Promise<{ lang: string }> }): Promise<Metadata> {
  return englishOnlyPageMetadata("returnsWarranty", (await params).lang);
}

export default function ShippingRefundPoliciesPage({
  params,
}: {
  params: Promise<{ lang: string }>;
}) {
  return <ReturnsWarrantyPage params={params} />;
}
