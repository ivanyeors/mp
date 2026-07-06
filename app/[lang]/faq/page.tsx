import { MarketingFaqPage, generateFaqMetadata } from "@/components/marketing/faq-page";

export const generateMetadata = generateFaqMetadata;

type Props = {
  params: Promise<{ lang: string }>;
  searchParams?: Promise<{ q?: string }>;
};

export default function FaqPage(props: Props) {
  return <MarketingFaqPage {...props} />;
}
