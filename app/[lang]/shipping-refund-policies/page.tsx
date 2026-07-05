import { MarketingStubPage } from "@/components/marketing/marketing-stub-page";

export default function ShippingRefundPoliciesPage({ params }: { params: Promise<{ lang: string }> }) {
  return <MarketingStubPage title="Returns & Warranty" params={params} />;
}
