import { PartnersPage } from "@/components/marketing/partners-page";

export default function OurPartnersPage({
  params,
}: {
  params: Promise<{ lang: string }>;
}) {
  return <PartnersPage params={params} />;
}
