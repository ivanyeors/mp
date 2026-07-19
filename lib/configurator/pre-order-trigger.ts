/**
 * Live Pre-order trigger (ADR 0005 / UX polish slice 05).
 * Soft low-stock badges (e.g. qty 3) do not flip — only stock_available <= 0
 * on a required preference, or composed sellable buildable <= 0.
 */

export type PreOrderTriggerInput = {
  /** Stocks for selected required preferences (cover/case or case-only). Omit unset. */
  preferenceStocks: ReadonlyArray<number>;
  /** Buildable units for the recommended composed sellable. */
  composedBuildable: number;
};

export function isPreOrder(input: PreOrderTriggerInput): { isPreOrder: boolean } {
  const prefOos = input.preferenceStocks.some((s) => s <= 0);
  const buildOos = input.composedBuildable <= 0;
  return { isPreOrder: prefOos || buildOos };
}

export function holdCtaLabel(preOrder: boolean): "Pre-order" | "Proceed" {
  return preOrder ? "Pre-order" : "Proceed";
}

export type PreOrderWaitingCopy = {
  title: string;
  body: string;
};

const WAITING: Record<"en-US" | "zh-CN", PreOrderWaitingCopy> = {
  "en-US": {
    title: "Pre-order — waiting time",
    body: "We can't build this combination from current inventory yet. We'll reach out to you shortly via WhatsApp about next steps. You can also Sign in later to track your customisation (Result) status.",
  },
  "zh-CN": {
    title: "预购 — 等待时间",
    body: "以当前库存还无法制作您选择的组合。我们会尽快通过 WhatsApp 联系您说明下一步。您也可稍后登录查看定制结果（Result）状态。",
  },
};

export function preOrderWaitingCopy(locale: string): PreOrderWaitingCopy {
  return locale === "zh-CN" ? WAITING["zh-CN"] : WAITING["en-US"];
}

/** Resolve stock for a selected preference item id from component option lists. */
export function preferenceStockFor(
  itemId: number | null,
  options: ReadonlyArray<{ item_id: number; stock_available: number }>,
): number | null {
  if (itemId == null) return null;
  const hit = options.find((o) => o.item_id === itemId);
  return hit ? hit.stock_available : null;
}
