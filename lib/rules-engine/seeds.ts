import type {
  BolsterLength,
  PillowSize,
  RangeBand,
  RuleEdge,
  RuleGraphJson,
  RuleNode,
} from "./types";
import { PILLOW_SIZES } from "./types";

/** ponytail: Range is [min,max); legacy uses ≤. +ε aligns integer cm; sub-ε cm if RangeBand gains maxInclusive. */
const LE = 0.01;

export const SHOULDER_BANDS_LEGACY: RangeBand[] = [
  { id: "b-xs", minCm: null, maxCm: 36 + LE, label: "XS" },
  { id: "b-s", minCm: 36 + LE, maxCm: 40 + LE, label: "S" },
  { id: "b-m", minCm: 40 + LE, maxCm: 46 + LE, label: "M" },
  { id: "b-l", minCm: 46 + LE, maxCm: 52 + LE, label: "L" },
  { id: "b-xl", minCm: 52 + LE, maxCm: null, label: "XL" },
];

export const HEIGHT_BANDS_LEGACY: RangeBand[] = [
  { id: "b-short", minCm: null, maxCm: 150, label: "short" },
  { id: "b-medium", minCm: 150, maxCm: 180 + LE, label: "medium" },
  { id: "b-long", minCm: 180 + LE, maxCm: null, label: "long" },
];

const ANY_BAND: RangeBand = { id: "b-any", minCm: null, maxCm: null, label: "any" };

export type PillowTemplateIds = Record<PillowSize, string>;
export type BolsterTemplateIds = Record<BolsterLength, string>;

export function premiumSeedGraph(templates: PillowTemplateIds): RuleGraphJson {
  const nodes: RuleNode[] = [
    { id: "in-shoulder", type: "input", inputKey: "shoulder_length_cm" },
    { id: "in-ntb", type: "input", inputKey: "neck_to_back_cm" },
    { id: "in-htb", type: "input", inputKey: "head_to_back_cm" },
    { id: "in-nl", type: "input", inputKey: "neck_length_cm" },
    {
      id: "rng-shoulder",
      type: "range",
      inputKey: "shoulder_length_cm",
      bands: SHOULDER_BANDS_LEGACY,
    },
    { id: "rng-ntb", type: "range", inputKey: "neck_to_back_cm", bands: [ANY_BAND] },
    { id: "rng-htb", type: "range", inputKey: "head_to_back_cm", bands: [ANY_BAND] },
    { id: "rng-nl", type: "range", inputKey: "neck_length_cm", bands: [ANY_BAND] },
    { id: "fb", type: "fallback", size: "M", templateId: templates.M },
  ];

  const edges: RuleEdge[] = [
    { id: "e-in-sh", source: "in-shoulder", target: "rng-shoulder" },
    { id: "e-in-ntb", source: "in-ntb", target: "rng-ntb" },
    { id: "e-in-htb", source: "in-htb", target: "rng-htb" },
    { id: "e-in-nl", source: "in-nl", target: "rng-nl" },
  ];

  for (const size of PILLOW_SIZES) {
    const sz = `sz-${size.toLowerCase()}`;
    const comb = `comb-${size.toLowerCase()}`;
    const tpl = `tpl-${size.toLowerCase()}`;
    const band = SHOULDER_BANDS_LEGACY.find((b) => b.label === size)!;
    nodes.push(
      { id: sz, type: "size-output", size },
      { id: comb, type: "combine" },
      { id: tpl, type: "template-output", templateId: templates[size], size },
    );
    edges.push(
      { id: `e-sh-${size}`, source: "rng-shoulder", target: sz, handle: band.id },
      { id: `e-sz-${size}`, source: sz, target: comb },
      { id: `e-ntb-${size}`, source: "rng-ntb", target: comb, handle: "b-any" },
      { id: `e-htb-${size}`, source: "rng-htb", target: comb, handle: "b-any" },
      { id: `e-nl-${size}`, source: "rng-nl", target: comb, handle: "b-any" },
      { id: `e-tpl-${size}`, source: comb, target: tpl },
    );
  }

  return { nodes, edges };
}

export function basicSeedGraph(templates: PillowTemplateIds): RuleGraphJson {
  const nodes: RuleNode[] = [
    { id: "in-shoulder", type: "input", inputKey: "shoulder_length_cm" },
    {
      id: "rng-shoulder",
      type: "range",
      inputKey: "shoulder_length_cm",
      bands: SHOULDER_BANDS_LEGACY,
    },
    { id: "fb", type: "fallback", size: "M", templateId: templates.M },
  ];
  const edges: RuleEdge[] = [
    { id: "e-in-sh", source: "in-shoulder", target: "rng-shoulder" },
  ];

  for (const size of PILLOW_SIZES) {
    const sz = `sz-${size.toLowerCase()}`;
    const tpl = `tpl-${size.toLowerCase()}`;
    const band = SHOULDER_BANDS_LEGACY.find((b) => b.label === size)!;
    nodes.push(
      { id: sz, type: "size-output", size },
      { id: tpl, type: "template-output", templateId: templates[size], size },
    );
    edges.push(
      { id: `e-sh-${size}`, source: "rng-shoulder", target: sz, handle: band.id },
      { id: `e-tpl-${size}`, source: sz, target: tpl },
    );
  }

  return { nodes, edges };
}

export function mbolsterSeedGraph(templates: BolsterTemplateIds): RuleGraphJson {
  const lengths = ["short", "medium", "long"] as const;
  const nodes: RuleNode[] = [
    { id: "in-height", type: "input", inputKey: "height_cm" },
    {
      id: "rng-height",
      type: "range",
      inputKey: "height_cm",
      bands: HEIGHT_BANDS_LEGACY,
    },
    { id: "fb", type: "fallback", size: "medium", templateId: templates.medium },
  ];
  const edges: RuleEdge[] = [
    { id: "e-in-h", source: "in-height", target: "rng-height" },
  ];

  for (const length of lengths) {
    const sz = `sz-${length}`;
    const tpl = `tpl-${length}`;
    const band = HEIGHT_BANDS_LEGACY.find((b) => b.label === length)!;
    nodes.push(
      { id: sz, type: "size-output", size: length },
      { id: tpl, type: "template-output", templateId: templates[length], size: length },
    );
    edges.push(
      { id: `e-h-${length}`, source: "rng-height", target: sz, handle: band.id },
      { id: `e-tpl-${length}`, source: sz, target: tpl },
    );
  }

  return { nodes, edges };
}
