"use client";

import { lazy, Suspense } from "react";
import { AiButton } from "@/components/block-editor/ai-button";
import type { RewritableBlock } from "@/lib/email-campaigns/ai-refine-brief";
import { useCampaignAi, type CampaignAi } from "./ai-context";

const rewriteAi = () => import("./rewrite-ai");
const RewriteMenu = lazy(() => rewriteAi().then((m) => ({ default: m.RewriteMenu })));
const RewriteOfferView = lazy(() => rewriteAi().then((m) => ({ default: m.RewriteOfferView })));

export function RewriteTool({ block, name, idPrefix }: { block: RewritableBlock; name: string; idPrefix: string }) {
  if (!useCampaignAi()) return null;
  const id = `${idPrefix}-rewrite`;
  return (
    <Suspense
      fallback={
        <AiButton id={id} variant="ghost" className="h-8 px-2" aria-label={`Rewrite with Claude: ${name}`}>
          Rewrite
        </AiButton>
      }
    >
      <RewriteMenu id={id} name={name} block={block} />
    </Suspense>
  );
}

export function RewriteOffered({ block, idPrefix }: { block: RewritableBlock; idPrefix: string }) {
  const ai = useCampaignAi();
  const offer = ai?.rewrite.offer;
  if (!ai || !offer || offer.blockId !== block.id || offer.status === "working") return null;
  return (
    <Suspense fallback={null}>
      <RewriteOfferView offer={offer} idPrefix={idPrefix} onReplace={ai.rewrite.replace} onTryAgain={ai.rewrite.tryAgain} onKeepMine={ai.rewrite.keepMine} />
    </Suspense>
  );
}

export const rewriteOffered = (ai: CampaignAi | null, id: string) => Boolean(ai?.rewrite.offer && ai.rewrite.offer.blockId === id && ai.rewrite.offer.status !== "working");
