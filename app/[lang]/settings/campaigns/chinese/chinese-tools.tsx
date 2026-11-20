"use client";

import { Check } from "lucide-react";
import { AiButton } from "@/components/block-editor/ai-button";
import type { BlockFormProps } from "@/components/block-editor/types";
import { Button } from "@/components/ui/button";
import { CHINESE_EDITOR_TEXT } from "@/lib/email-campaigns/chinese-version";
import type { EmailBlock } from "@/lib/email-campaigns/content";
import type { RewritableBlock } from "@/lib/email-campaigns/ai-refine-brief";
import { RewriteTool } from "../ai/rewrite-tools";
import { useChineseEditing } from "./chinese-context";

export function ChineseTools<B extends EmailBlock>({ block, name }: BlockFormProps<B> & { name: string }) {
  const zh = useChineseEditing();
  const status = zh?.status(block.id);
  const drafted = zh?.drafted(block.id) ?? false;
  if (!zh || !status || (status === "current" && !drafted)) return null;
  const working = zh.working?.id === block.id ? zh.working.stage : null;
  return (
    <span className="flex items-center gap-1">
      {zh.translate && status !== "current" ? (
        <AiButton
          variant="ghost"
          className="h-8 px-2"
          aria-label={`${status === "changed" ? CHINESE_EDITOR_TEXT.blockAgain : CHINESE_EDITOR_TEXT.block} into Chinese: ${name}`}
          working={working}
          onStop={zh.stop}
          disabledReason={working ? null : zh.reason}
          onClick={() => zh.translate?.(block.id)}
        >
          {status === "changed" ? CHINESE_EDITOR_TEXT.blockAgain : CHINESE_EDITOR_TEXT.block}
        </AiButton>
      ) : null}
      {(status === "changed" || (status === "current" && drafted)) && !working ? (
        <Button type="button" variant="ghost" size="sm" className="h-8 px-2" aria-label={`Keep the Chinese as it is: ${name}`} onClick={() => zh.keep(block.id)}>
          <Check className="mr-1 h-4 w-4" aria-hidden />
          {CHINESE_EDITOR_TEXT.keep}
        </Button>
      ) : null}
    </span>
  );
}

export function BlockTools<B extends RewritableBlock>(props: BlockFormProps<B> & { name: string }) {
  return useChineseEditing() ? <ChineseTools {...props} /> : <RewriteTool block={props.block} name={props.name} idPrefix={props.idPrefix} />;
}
