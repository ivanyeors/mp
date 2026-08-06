# Graph Report - /private/tmp/claude-501/-Volumes-Crucial-SSD-2TB-Projects-mp/23b2cdcc-bf8b-47be-bfaf-e28c5f1f2c44/scratchpad/rules-engine-graph  (2026-08-06)

## Corpus Check
- Corpus is ~25,846 words - fits in a single context window. You may not need a graph.

## Summary
- 392 nodes · 761 edges · 24 communities (18 shown, 6 thin omitted)
- Extraction: 98% EXTRACTED · 2% INFERRED · 0% AMBIGUOUS · INFERRED: 19 edges (avg confidence: 0.65)
- Token cost: 95,541 input · 0 output

## Community Hubs (Navigation)
- Recommend, Carry-Over & Journey
- Design Spec: PRD, ADR & Rule-Graph Concepts
- Evaluation Engine & Node Types
- Seed Graphs & Validation
- Input Catalog & Configurator Inputs
- Assign-Hint, Reveal & Why-Trace
- Workbench Canvas & Node Views
- Persistence, Versions & Fixtures
- Ports, Units & Flow Labels
- Slice-01 Core Checks
- Auto-Layout
- X-Ray Preview
- API: Draft Get/Save
- Tier Suggestion UI
- Seed Script
- API: Evaluate Route
- Upsell Card UI
- API: Publish Route
- API: Restore Version Route
- API: Versions List Route
- Recommendation Reveal UI
- Workbench Mobile Check

## God Nodes (most connected - your core abstractions)
1. `evaluate()` - 14 edges
2. `validateForPublish()` - 13 edges
3. `makeNodeTypes()` - 12 edges
4. `main()` - 11 edges
5. `evaluateOrThrow()` - 11 edges
6. `RuleFlow` - 11 edges
7. `Rule graph` - 11 edges
8. `premiumHandGraph()` - 9 edges
9. `RuleGraphJson` - 9 edges
10. `Slice 01: Rule graph schema + evaluation & validation core` - 9 edges

## Surprising Connections (you probably didn't know these)
- `Slice 01: Rule graph schema + evaluation & validation core` --implements--> `evaluate()`  [INFERRED]
  PRD-rules-engine/issues/01-rule-graph-schema-engine-core.md → lib/rules-engine/evaluate.ts
- `Evaluation engine (evaluate)` --implements--> `evaluate()`  [INFERRED]
  PRD-rules-engine/rules-engine-prd.md → lib/rules-engine/evaluate.ts
- `RangeNode` --implements--> `Range node`  [INFERRED]
  lib/rules-engine/types.ts → PRD-rules-engine/rules-engine-prd.md
- `defaultRule()` --references--> `RULE_FLOWS`  [EXTRACTED]
  components/rules-engine/workbench.tsx → lib/rules-engine/types.ts
- `prettyKey()` --references--> `SizeOrLength`  [EXTRACTED]
  components/rules-engine/workbench.tsx → lib/rules-engine/types.ts

## Import Cycles
- None detected.

## Hyperedges (group relationships)
- **Rules Engine build slices 01-07** — prd_rules_engine_issues_01_rule_graph_schema_engine_core_slice_01, prd_rules_engine_issues_02_workbench_canvas_slice_02, prd_rules_engine_issues_03_seeding_single_engine_cutover_slice_03, prd_rules_engine_issues_04_configurator_required_inputs_inches_slice_04, prd_rules_engine_issues_05_preview_recommendation_assign_hint_slice_05, prd_rules_engine_issues_06_flow_route_upsell_cross_sell_slice_06, prd_rules_engine_issues_07_xray_readonly_preview_upgrade_slice_07 [EXTRACTED 0.90]
- **Evaluate to recommendation record to preview reveal flow** — prd_rules_engine_rules_engine_prd_rule_graph, prd_rules_engine_rules_engine_prd_evaluate, prd_rules_engine_rules_engine_prd_recommendation_record, prd_rules_engine_rules_engine_prd_reveal_gate, prd_rules_engine_rules_engine_prd_result [INFERRED 0.85]
- **Rule graph typed-DAG node palette** — prd_rules_engine_rules_engine_prd_input_node, prd_rules_engine_rules_engine_prd_range_node, prd_rules_engine_rules_engine_prd_match_node, prd_rules_engine_rules_engine_prd_combine_node, prd_rules_engine_rules_engine_prd_terminal, prd_rules_engine_rules_engine_prd_fallback [EXTRACTED 0.90]

## Communities (24 total, 6 thin omitted)

### Community 0 - "Recommend, Carry-Over & Journey"
Cohesion: 0.06
Nodes (42): carryOverAnswers(), CUSTOMIZE_KEYS, EXPECTED_MISSING, inputPresent(), missingStepsAfterCarryOver(), pairKey(), STEP_INPUT_KEYS, stepComplete() (+34 more)

### Community 1 - "Design Spec: PRD, ADR & Rule-Graph Concepts"
Cohesion: 0.09
Nodes (44): ADR 0010: Rules Engine is the single recommendation authority, Slice 01: Rule graph schema + evaluation & validation core, Slice 02: Workbench canvas (React Flow, palette, test panel, versions), Slice 03: Seeding + single-engine cutover, Slice 04: Configurator inputs (inches default, all required), Slice 05: Preview recommendation display + assign hint upgrade, Slice 06: Flow route upsell/cross-sell + carry-over + journey, Slice 07: X-ray read-only preview upgrade (+36 more)

### Community 2 - "Evaluation Engine & Node Types"
Cohesion: 0.09
Nodes (31): Adj, asNumber(), bandMatches(), buildAdj(), evaluate(), evaluateOrThrow(), matchValue(), nodeMap() (+23 more)

### Community 3 - "Seed Graphs & Validation"
Cohesion: 0.09
Nodes (28): catalogDef(), legacyShoulderSize(), basicSeedGraph(), HEIGHT_BANDS_LEGACY, mbolsterSeedGraph(), premiumSeedGraph(), SHOULDER_BANDS_LEGACY, premium (+20 more)

### Community 4 - "Input Catalog & Configurator Inputs"
Cohesion: 0.10
Nodes (27): BASIC_CATALOG, CATALOGS, CUSTOMIZE_INPUTS, inputCatalog(), MBOLSTER_CATALOG, missingRequiredInputs(), PREMIUM_CATALOG, referencedInputKeys() (+19 more)

### Community 5 - "Assign-Hint, Reveal & Why-Trace"
Cohesion: 0.11
Nodes (21): AssignHintInput, AssignHintSource, numericTemplateId(), resolveAssignHintTemplateId(), selectAssignHintSource(), RevealGateInput, shouldRevealRecommendation(), assignPage (+13 more)

### Community 6 - "Workbench Canvas & Node Views"
Cohesion: 0.11
Nodes (22): CombineNodeView(), FallbackView(), FlowRouteView(), InputNode(), makeNodeTypes(), MatchNodeView(), Props, RangeNodeView() (+14 more)

### Community 7 - "Persistence, Versions & Fixtures"
Cohesion: 0.22
Nodes (19): cleanup(), FLOW, main(), basicWithPremiumUpsellGraph(), DEFAULT_TEMPLATE_IDS, premiumHandGraph(), premiumSampleInputs(), getDraft() (+11 more)

### Community 8 - "Ports, Units & Flow Labels"
Cohesion: 0.12
Nodes (18): FLOW_LABELS, FLOW_OPTIONS, canConnect(), inputValuePort(), PortKind, sourcePort(), targetPort(), apiRoutes (+10 more)

### Community 9 - "Slice-01 Core Checks"
Cohesion: 0.09
Nodes (20): a, b, cycle, draft, dTpl, gap, graph, incomplete (+12 more)

### Community 10 - "Auto-Layout"
Cohesion: 0.22
Nodes (9): bary(), edges, ids, orphan, pos, slots, LayoutEdge, LayoutPos (+1 more)

### Community 11 - "X-Ray Preview"
Cohesion: 0.25
Nodes (6): previewMixMode(), basic, customize, mb, mp, reveal

### Community 13 - "Tier Suggestion UI"
Cohesion: 0.50
Nodes (4): TIER_LABELS, TierSuggestion(), tierSuggestionCopy(), TierSuggestionProps

### Community 14 - "Seed Script"
Cohesion: 0.70
Nodes (4): bolsterTemplates(), main(), pillowTemplates(), seedFlow()

### Community 15 - "API: Evaluate Route"
Cohesion: 0.67
Nodes (3): BodySchema, Ctx, POST()

### Community 16 - "Upsell Card UI"
Cohesion: 0.67
Nodes (3): priceOrDash(), UpsellCard(), UpsellCardProps

## Knowledge Gaps
- **128 isolated node(s):** `Ctx`, `Ctx`, `GraphSchema`, `Ctx`, `Ctx` (+123 more)
  These have ≤1 connection - possible missing edges or undocumented components.
- **6 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `evaluate()` connect `Evaluation Engine & Node Types` to `Recommend, Carry-Over & Journey`, `Design Spec: PRD, ADR & Rule-Graph Concepts`, `Input Catalog & Configurator Inputs`, `Persistence, Versions & Fixtures`, `Slice-01 Core Checks`?**
  _High betweenness centrality (0.147) - this node is a cross-community bridge._
- **Why does `Slice 01: Rule graph schema + evaluation & validation core` connect `Design Spec: PRD, ADR & Rule-Graph Concepts` to `Evaluation Engine & Node Types`?**
  _High betweenness centrality (0.092) - this node is a cross-community bridge._
- **Why does `SizeOrLength` connect `Workbench Canvas & Node Views` to `Recommend, Carry-Over & Journey`, `Evaluation Engine & Node Types`, `Seed Graphs & Validation`?**
  _High betweenness centrality (0.074) - this node is a cross-community bridge._
- **Are the 2 inferred relationships involving `evaluate()` (e.g. with `Slice 01: Rule graph schema + evaluation & validation core` and `Evaluation engine (evaluate)`) actually correct?**
  _`evaluate()` has 2 INFERRED edges - model-reasoned connections that need verification._
- **Are the 9 inferred relationships involving `makeNodeTypes()` (e.g. with `CombineNodeView()` and `FallbackView()`) actually correct?**
  _`makeNodeTypes()` has 9 INFERRED edges - model-reasoned connections that need verification._
- **What connects `Ctx`, `Ctx`, `GraphSchema` to the rest of the system?**
  _128 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `Recommend, Carry-Over & Journey` be split into smaller, more focused modules?**
  _Cohesion score 0.06203007518796992 - nodes in this community are weakly interconnected._