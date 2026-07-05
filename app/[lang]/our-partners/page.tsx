import { MarketingStubPage } from "@/components/marketing/marketing-stub-page";

export default function OurPartnersPage({ params }: { params: Promise<{ lang: string }> }) {
  return <MarketingStubPage title="Our Partners" params={params} />;
}
