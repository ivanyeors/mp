# Rules Engine is the single recommendation authority

All measurement → size / tier-suggestion / **Filling Template** recommendations derive from one published, versioned **Rule graph** per flow (Premium Mpillow, Basic Mpillow, Mbolster), authored by Staff on a node canvas and evaluated by one pure TypeScript engine. We chose this over the status quo (three divergent hardcoded engines: shop `SIZE_MAP`, in-store shoulder bands, basic recommend) and over LLM-driven recommendations, because operators need to change the logic without deploys, surfaces must never disagree, and every past recommendation must be explainable (Results store graph version + fired terminals + trace).

## Considered options

- **Keep hardcoded rules, add a config table for thresholds** — rejected: cannot express multi-measurement range rules, branching on form answers, or upsell routing; the three-engine disagreement survives.
- **LLM recommendation as authority** — rejected: non-deterministic, unexplainable months later, unacceptable for clinical/liability posture. Existing LLM hooks stay dormant; node ids remain aligned for a possible future advisory role.
- **Structured decision tables instead of a node canvas** — rejected by product: logic complexity and planned growth (upsell/cross-sell routing, health branching) want a graph workbench; the underlying model is a typed DAG either way.

## Consequences

- Seed graphs must reproduce legacy behavior before cutover (seed-equivalence tests are the regression net); a bootstrap guard falls back to legacy rules only while a flow has no published graph, then is deleted.
- Engine output is a **Recommendation record**, never a filling snapshot: guest **Results** keep a null snapshot until Admin Panel assign (ADR 0002 review gate unchanged); the assign hint upgrades to the engine-recommended template.
- Sold tier stays flow-scoped: the graph advises (Tier suggestion) and routes with consent (Flow route → Upsell card) but never changes a held product or amount on its own.
- Publish is gated by validation (DAG, contiguous non-overlapping bands, reachable Fallback, size-scoped template outputs, same-flow fallback beside every Flow route) so a broken graph cannot run live.
- `@xyflow/react` (React Flow) is adopted for the authoring canvas; evaluation stays dependency-free pure TS.
