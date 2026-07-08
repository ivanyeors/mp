import {
  SupportContactPage,
  generateSupportMetadata,
} from "@/components/marketing/support-contact-page";

export const generateMetadata = generateSupportMetadata;

export default function SupportPage({ params }: { params: Promise<{ lang: string }> }) {
  return <SupportContactPage params={params} />;
}
