import type { RuleFlow } from "./types";
import { RULE_FLOWS } from "./types";

export const FLOW_LABELS: Record<RuleFlow, string> = {
  "premium-mpillow": "Premium Mpillow",
  "basic-mpillow": "Basic Mpillow",
  mbolster: "Mbolster",
};

export const FLOW_OPTIONS = RULE_FLOWS.map((id) => ({
  id,
  label: FLOW_LABELS[id],
}));
