import { MarketingStubPage } from "@/components/marketing/marketing-stub-page";

export default function PrivacyPolicyPage({ params }: { params: Promise<{ lang: string }> }) {
  return <MarketingStubPage title="Privacy Policy" params={params} />;
}
