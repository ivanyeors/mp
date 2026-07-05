import { MarketingStubPage } from "@/components/marketing/marketing-stub-page";

export default function FaqPage({ params }: { params: Promise<{ lang: string }> }) {
  return <MarketingStubPage title="FAQ" params={params} />;
}
