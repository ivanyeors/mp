import { JsonLdScript } from "@/components/seo/json-ld-script";

type ConfiguratorSeoIntroProps = {
  h1: string;
  answerLede: string;
  jsonLd: Record<string, unknown>;
};

export function ConfiguratorSeoIntro({ h1, answerLede, jsonLd }: ConfiguratorSeoIntroProps) {
  return (
    <article className="mx-auto max-w-3xl px-4 pt-8 pb-4 text-center">
      <JsonLdScript data={jsonLd} />
      <h1 className="text-3xl font-bold tracking-tight md:text-4xl">{h1}</h1>
      <p className="mt-4 text-base leading-relaxed text-muted-foreground md:text-lg">
        {answerLede}
      </p>
    </article>
  );
}
