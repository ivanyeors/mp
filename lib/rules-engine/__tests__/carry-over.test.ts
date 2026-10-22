import { describe, it, expect } from "vitest";
import {
  carryOverAnswers,
  FLOW_ROUTE_EXPECTATION,
  missingStepsAfterCarryOver,
} from "../carry-over";
import { basicWithPremiumUpsellGraph, DEFAULT_TEMPLATE_IDS } from "../fixtures";
import { evaluateOrThrow } from "../evaluate";
import { recordFromEvaluate } from "../recommendation-record";
import type { RecommendationRecord } from "../recommendation-record";
import {
  assertPreStripeRouteResolved,
  isFlowRoutePending,
  stampAcceptedTargetRecord,
  withJourneyOnAccept,
  withJourneyOnDecline,
} from "../journey";
import { assertPublishable } from "../validate";

const basicAnswers = {
  shoulder_length_cm: 42,
  sleep_position: "side",
  bed_firmness: "medium",
  acid_reflux: true,
  ear_discomfort_side_sleep: false,
  blood_pressure: "normal",
  sleep_pain_areas: ["none"],
  uses_bolster: false,
  gender: "female",
  age_group: "35-44",
};

const bolsterAnswers = { height_cm: 170 };

describe("carryOverAnswers", () => {
  it("Basic → Premium keeps shared shoulder + customize keys only", () => {
    const carried = carryOverAnswers(
      "basic-mpillow",
      "premium-mpillow",
      basicAnswers,
    );
    expect(carried.shoulder_length_cm).toBe(42);
    expect(carried.sleep_position).toBe("side");
    expect(carried).not.toHaveProperty("neck_to_back_cm");
    expect(Object.keys(carried).sort()).toEqual(
      [
        "shoulder_length_cm",
        "sleep_position",
        "bed_firmness",
        "acid_reflux",
        "ear_discomfort_side_sleep",
        "blood_pressure",
        "sleep_pain_areas",
        "uses_bolster",
        "gender",
        "age_group",
      ].sort(),
    );
  });

  it("Bolster → Premium drops height (no shared measurement keys)", () => {
    const carried = carryOverAnswers("mbolster", "premium-mpillow", bolsterAnswers);
    expect(carried).toEqual({});
  });

  it("Bolster → Basic drops height and target-only keys", () => {
    const carried = carryOverAnswers("mbolster", "basic-mpillow", bolsterAnswers);
    expect(carried).toEqual({});
  });
});

describe("missingStepsAfterCarryOver", () => {
  it("Basic → Premium needs the neck trio", () => {
    const carried = carryOverAnswers(
      "basic-mpillow",
      "premium-mpillow",
      basicAnswers,
    );
    expect(
      missingStepsAfterCarryOver("basic-mpillow", "premium-mpillow", carried),
    ).toEqual(["neck-to-back", "head-to-back", "neck-length"]);
  });

  it("Bolster → Premium asks age and health before measuring, photos last", () => {
    expect(
      missingStepsAfterCarryOver("mbolster", "premium-mpillow", {}),
    ).toEqual([
      "age",
      "health",
      "shoulder-length",
      "neck-to-back",
      "head-to-back",
      "neck-length",
      "photos",
    ]);
  });

  it("Bolster → Basic asks age and health, then shoulder, photos last", () => {
    expect(
      missingStepsAfterCarryOver("mbolster", "basic-mpillow", {}),
    ).toEqual(["age", "health", "shoulder-length", "photos"]);
  });

  it("keeps the photos step even when every answer carried over", () => {
    expect(
      missingStepsAfterCarryOver("mbolster", "basic-mpillow", basicAnswers),
    ).toEqual(["photos"]);
  });

  it("filters steps already present in carried answers", () => {
    const carried = carryOverAnswers(
      "basic-mpillow",
      "premium-mpillow",
      basicAnswers,
    );
    const withNeck = {
      ...carried,
      neck_to_back_cm: 10,
      head_to_back_cm: 12,
      neck_length_cm: 9,
    };
    expect(
      missingStepsAfterCarryOver("basic-mpillow", "premium-mpillow", withNeck),
    ).toEqual([]);
  });
});

describe("FLOW_ROUTE_EXPECTATION", () => {
  it("sets Bolster → Mpillow measuring expectation", () => {
    expect(FLOW_ROUTE_EXPECTATION).toMatch(/2 minute/i);
  });
});

const routeRecord = (
  over: Partial<RecommendationRecord> = {},
): RecommendationRecord => ({
  graphVersionId: "g1",
  flow: "basic-mpillow",
  entryFlow: "basic-mpillow",
  finalFlow: "basic-mpillow",
  size: "M",
  templateId: "3",
  tierSuggestion: null,
  soldTier: "basic",
  flowRoute: {
    targetFlow: "premium-mpillow",
    reason: "Acid reflux",
    nodeId: "route-premium",
  },
  flowRouteDecision: "pending",
  firedTerminals: [],
  trace: [],
  usedFallback: false,
  usedLegacyBootstrap: false,
  ...over,
});

describe("journey recording", () => {
  it("isFlowRoutePending when route fired and not resolved", () => {
    expect(isFlowRoutePending(routeRecord())).toBe(true);
    expect(isFlowRoutePending(routeRecord({ flowRouteDecision: null }))).toBe(true);
    expect(isFlowRoutePending(routeRecord({ flowRoute: null }))).toBe(false);
    expect(
      isFlowRoutePending(withJourneyOnDecline(routeRecord())),
    ).toBe(false);
  });

  it("withJourneyOnDecline keeps same-flow result and records decline", () => {
    const declined = withJourneyOnDecline(routeRecord());
    expect(declined.entryFlow).toBe("basic-mpillow");
    expect(declined.finalFlow).toBe("basic-mpillow");
    expect(declined.flowRouteDecision).toBe("declined");
    expect(declined.flowRoute?.targetFlow).toBe("premium-mpillow");
  });

  it("withJourneyOnAccept sets finalFlow to target", () => {
    const accepted = withJourneyOnAccept(routeRecord(), "premium-mpillow");
    expect(accepted.finalFlow).toBe("premium-mpillow");
    expect(accepted.flowRouteDecision).toBe("accepted");
    expect(accepted.entryFlow).toBe("basic-mpillow");
  });
});

describe("basicWithPremiumUpsellGraph", () => {
  const g = basicWithPremiumUpsellGraph(DEFAULT_TEMPLATE_IDS);

  it("is publishable and fires Premium route on acid_reflux", () => {
    expect(assertPublishable("basic-mpillow", g)).toEqual({ ok: true });
    const r = evaluateOrThrow("basic-mpillow", g, {
      shoulder_length_cm: 42,
      acid_reflux: true,
    });
    expect(r.size).toBe("M");
    expect(r.flowRoute?.targetFlow).toBe("premium-mpillow");
    expect(r.flowRoute?.reason).toMatch(/Acid reflux/i);

    const record = recordFromEvaluate("basic-mpillow", "v-upsell", r, "basic");
    expect(record.flowRouteDecision).toBe("pending");
    expect(isFlowRoutePending(record)).toBe(true);
    expect(assertPreStripeRouteResolved(record).ok).toBe(false);
    expect(assertPreStripeRouteResolved(withJourneyOnDecline(record)).ok).toBe(true);
  });

  it("does not fire route when acid_reflux is false", () => {
    const r = evaluateOrThrow("basic-mpillow", g, {
      shoulder_length_cm: 42,
      acid_reflux: false,
    });
    expect(r.flowRoute).toBeNull();
    expect(r.size).toBe("M");
  });
});

describe("stampAcceptedTargetRecord", () => {
  it("keeps entry journey on target re-eval", () => {
    const entry = withJourneyOnAccept(routeRecord(), "premium-mpillow");
    const target: RecommendationRecord = {
      ...routeRecord({
        flow: "premium-mpillow",
        entryFlow: "premium-mpillow",
        finalFlow: "premium-mpillow",
        soldTier: "premium",
        flowRoute: null,
        flowRouteDecision: null,
        size: "L",
      }),
    };
    const stamped = stampAcceptedTargetRecord(entry, target);
    expect(stamped.entryFlow).toBe("basic-mpillow");
    expect(stamped.finalFlow).toBe("premium-mpillow");
    expect(stamped.flowRouteDecision).toBe("accepted");
    expect(stamped.flowRoute?.nodeId).toBe("route-premium");
    expect(stamped.size).toBe("L");
  });
});

describe("assertPreStripeRouteResolved", () => {
  it("blocks hold while route pending", () => {
    const gate = assertPreStripeRouteResolved(routeRecord());
    expect(gate.ok).toBe(false);
    if (gate.ok) return;
    expect(gate.reason).toMatch(/awaiting shopper decision/i);
  });

  it("allows hold after decline or accept", () => {
    expect(assertPreStripeRouteResolved(withJourneyOnDecline(routeRecord()))).toEqual({
      ok: true,
    });
    expect(
      assertPreStripeRouteResolved(withJourneyOnAccept(routeRecord(), "premium-mpillow")),
    ).toEqual({ ok: true });
  });

  it("allows hold when no route fired", () => {
    expect(
      assertPreStripeRouteResolved(routeRecord({ flowRoute: null, flowRouteDecision: null })),
    ).toEqual({ ok: true });
  });

  it("accepts minimal gate shape", () => {
    expect(
      assertPreStripeRouteResolved({
        flowRoute: { targetFlow: "premium-mpillow", reason: "x", nodeId: "n1" },
        flowRouteDecision: "pending",
      }),
    ).toEqual({
      ok: false,
      reason: "Flow route upsell awaiting shopper decision before Stripe hold",
    });
  });
});
