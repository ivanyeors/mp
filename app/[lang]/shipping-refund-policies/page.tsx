import { MarketingStubPage } from "@/components/marketing/marketing-stub-page";

export default function ShippingRefundPoliciesPage({ params }: { params: Promise<{ lang: string }> }) {
  return <MarketingStubPage title="Shipping, Refund & Other Policies" params={params} />;
}
