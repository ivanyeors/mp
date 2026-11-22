export type ClaimRule = { readonly name: string; readonly pattern: RegExp };

export const CLAIM_RULES: readonly ClaimRule[] = [
  { name: "relieve / relief (pain relief is a medical purpose, HSA GL-06)", pattern: /\breliev(?:e|es|ed|ing)\b|\brelief\b/i },
  { name: "pain-free", pattern: /\bpain[- ]free\b/i },
  { name: "reduces pain", pattern: /\breduc(?:e|es|ed|ing)\b(?:\W+\w+){0,4}?\W+pain\b/i },
  {
    name: "treat",
    pattern: /\btreat(?:s|ed|ing)?\s+(?:your\s+|the\s+)?(?:neck|back|shoulders?|pain|symptoms?|conditions?|injur\w*|insomnia|sleep apno?ea|disorders?)\b|\btreatments?\b/i,
  },
  { name: "cure", pattern: /\bcur(?:e|es|ed|ing)\b/i },
  { name: "heal", pattern: /\bheal(?:s|ed|ing)?\b/i },
  { name: "fixes the neck", pattern: /\bfix(?:es)? (?:your |the )?neck\b/i },
  {
    name: "corrects posture or spine",
    pattern: /\bcorrect(?:s|ing)?\b(?:\W+\w+){0,2}?\W+(?:posture|spine|alignment)\b|\brealign(?:s|ing)? (?:your |the )?spine\b/i,
  },
  { name: "rehab", pattern: /\brehab(?:ilitat\w*)?\b/i },
  { name: "prescribe", pattern: /\bprescri(?:be|bes|bed|bing|ption)\b/i },
  { name: "orthopaedic", pattern: /\borthopa?edic\b/i },
  { name: "clinically proven", pattern: /\bclinically (?:proven|tested|shown)\b/i },
  {
    name: "professional endorsement",
    pattern: /\b(?:doctors?|physio(?:therapist)?s?|chiropractors?)[- ]recommended\b|\brecommended by (?:doctors|physio|chiropractors)/i,
  },
  { name: "guaranteed", pattern: /\bguarantee(?:d|s)?\b/i },
  { name: "breathing", pattern: /\bbetter breathing\b|\bbreathe? (?:better|easier|easily)\b|\bairways?\b/i },
  { name: "Science of Sleep (retired)", pattern: /science of sleep/i },
  { name: "zh: relieve, treat, cure, correct, endorse or breathing", pattern: /缓解|(?<!物理)治疗|治愈|矫正|止痛|临床证明|医生推荐|呼吸更|更易呼吸/ },
];

const MEDICAL_CONDITION =
  /surgery|scoliosis|reflux|apno?ea|\bnumb\b|spondyl|arthritis|herniat|slipped disc|insomnia|migraine|reversed neck|kyphosis|手术|脊柱侧弯|胃酸|呼吸暂停|麻木|反弓|关节炎|椎间盘|失眠|偏头痛/i;

export function findClaims(text: string): string[] {
  return CLAIM_RULES.filter((rule) => rule.pattern.test(text)).map((rule) => rule.name);
}

export function namesMedicalCondition(text: string): boolean {
  return MEDICAL_CONDITION.test(text);
}
