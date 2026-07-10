import { buildOrganizationJsonLd, buildWebSiteJsonLd } from "@/lib/seo/jsonld-organization";
import { JsonLdScript } from "@/components/seo/json-ld-script";

type SiteJsonLdProps = {
  lang: string;
};

export function SiteJsonLd({ lang }: SiteJsonLdProps) {
  return (
    <>
      <JsonLdScript data={buildOrganizationJsonLd(lang)} />
      <JsonLdScript data={buildWebSiteJsonLd(lang)} />
    </>
  );
}
