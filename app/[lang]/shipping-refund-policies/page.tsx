import { ReturnsWarrantyPage } from "@/components/marketing/returns-warranty-page";

export default function ShippingRefundPoliciesPage({
  params,
}: {
  params: Promise<{ lang: string }>;
}) {
  return <ReturnsWarrantyPage params={params} />;
}
