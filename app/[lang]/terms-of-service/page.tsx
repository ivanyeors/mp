import { MarketingStubPage } from "@/components/marketing/marketing-stub-page";

export default function TermsOfServicePage({ params }: { params: Promise<{ lang: string }> }) {
  return <MarketingStubPage title="Terms of Service" params={params} />;
}
